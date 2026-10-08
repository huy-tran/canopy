import type { Role } from './kit'

// Who each Claude session and subagent is in the workspace simulation: a unique first name and a
// role picked at random when they first appear, kept for as long as they are around.

const NAMES = [
  'Ava', 'Ben', 'Chloe', 'Dan', 'Ella', 'Finn', 'Grace', 'Harry', 'Isla', 'Jack', 'Kai', 'Lily', 'Max', 'Nina', 'Oscar', 'Pia',
  'Quinn', 'Ruby', 'Sam', 'Tara', 'Uma', 'Vince', 'Willa', 'Xavi', 'Yara', 'Zac', 'Aria', 'Blake', 'Cleo', 'Dev', 'Eve', 'Felix',
  'Gemma', 'Hugo', 'Ivy', 'Jonah', 'Kira', 'Leo', 'Mia', 'Noah', 'Olive', 'Priya', 'Remy', 'Sienna', 'Theo', 'Vera', 'Wren', 'Zoe',
  'Arlo', 'Bea', 'Cass', 'Dara', 'Eli', 'Faye', 'Gus', 'Hana', 'Iggy', 'Juno', 'Kofi', 'Luca', 'Mae', 'Nico', 'Otto', 'Rosa',
]

export interface Cast { name: string; role: Role }

const cast = new Map<string, Cast>()

/** Who an id is, if they are on the floor. */
export function castFor(id: string): Cast | undefined {
  return cast.get(id)
}

/** Names and roles for the ids on the floor now. Ids no longer there give their names back. */
export function castOf(ids: string[]): Map<string, Cast> {
  const live = new Set(ids)
  for (const id of cast.keys()) if (!live.has(id)) cast.delete(id)
  const used = new Set([...cast.values()].map(c => c.name))
  for (const id of ids) {
    if (cast.has(id)) continue
    const free = NAMES.filter(n => !used.has(n))
    let name = free[Math.floor(Math.random() * free.length)]
    // More people than names: number the repeats.
    for (let n = 2; !name; n++) {
      const base = NAMES[Math.floor(Math.random() * NAMES.length)]!
      if (!used.has(`${base} ${n}`)) name = `${base} ${n}`
    }
    used.add(name)
    cast.set(id, { name, role: Math.random() < 0.5 ? 'developer' : 'designer' })
  }
  return cast
}
