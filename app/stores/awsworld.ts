import { defineStore } from 'pinia'
import type { AwsWorld } from '#shared/aws'

/** A full read this often; every 10 seconds while a Beanstalk environment is changing, as aws-tui watches. */
const FULL_MS = 2 * 60_000
const MOVING_MS = 10_000

/**
 * EC2 instances and Beanstalk environments for the profile and region the AWS window is on: the
 * 3D World's data centre and the window's EC2 and Beanstalk lists. Read while either is open, never
 * while AWS is locked or Canopy is hidden. The last good read is saved on disk, so both fill in at
 * once on launch.
 */
export const useAwsWorldStore = defineStore('awsworld', () => {
  const A = useAwsStore()

  const raw = ref<AwsWorld | null>(null)
  /** Only a read for the profile and region showing counts; switching clears the old one away. */
  const world = computed<AwsWorld | null>(() => {
    const w = raw.value
    return w && w.profile === A.profile && w.region === A.region ? w : null
  })
  const loading = ref(false)
  const moving = computed(() => (world.value?.envs || []).some(ebMoving))
  let timer: ReturnType<typeof setTimeout> | null = null
  let cacheTried = false
  let users = 0

  const offscreen = () => typeof document !== 'undefined' && document.hidden

  async function read(force = false) {
    if (loading.value || !A.ctx || !A.lock?.unlocked) return
    if (!force && offscreen()) return
    loading.value = true
    try {
      const w = await api.aws.world(A.c(), force)
      if (w.problem) A.call(Promise.resolve({ ok: false, error: w.error || '', problem: w.problem }))
      // A failed read keeps the last good one on screen, with its error.
      const same = raw.value && raw.value.profile === w.profile && raw.value.region === w.region
      raw.value = w.error && same ? { ...raw.value!, error: w.error, problem: w.problem } : w
    } finally {
      loading.value = false
    }
  }

  /** Reads again on a schedule: soon while an environment is moving, else every couple of minutes. */
  function schedule() {
    if (timer) clearTimeout(timer)
    timer = null
    if (!users) return
    timer = setTimeout(async () => {
      await read(moving.value)
      schedule()
    }, moving.value ? MOVING_MS : FULL_MS)
  }

  async function start() {
    users++
    if (users > 1) return
    if (!A.ready) await A.init()
    if (!raw.value && !cacheTried) {
      cacheTried = true
      const cached = await api.aws.cachedWorld().catch(() => null)
      if (cached && !raw.value) raw.value = cached
    }
    if (!world.value || Date.now() - world.value.at > 60_000) read()
    schedule()
  }

  function stop() {
    users = Math.max(0, users - 1)
    if (!users && timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  // A new profile or region, or AWS unlocked: read it now.
  watch(() => [A.profile, A.region, A.lock?.unlocked], () => {
    if (users) {
      read()
      schedule()
    }
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && users && (!world.value || Date.now() - world.value.at > FULL_MS)) read()
    })
  }

  return { world, loading, moving, read, start, stop }
})
