// Nuxt UI theme overrides so components match the design's density and surfaces.
const menuItem = 'h-7 px-2.5 py-0 gap-2.5 items-center text-left rounded-md text-[12.5px] cursor-pointer before:rounded-md text-(--tx) data-highlighted:before:bg-(--hov)'
const menu = {
  slots: {
    content: 'min-w-32 bg-(--modal) ring-0 border border-(--bb) rounded-lg shadow-(--shadow) p-[4px]',
    viewport: 'divide-y divide-(--ln)',
    group: 'p-0 py-[5px] first:pt-0 last:pb-0',
    separator: 'mx-[4px] my-[5px] h-px bg-(--ln)',
    item: menuItem,
    itemLabel: 'truncate',
    itemTrailingKbds: 'inline-flex items-center shrink-0',
  },
  variants: {
    size: {
      md: { item: menuItem, label: 'px-2 pt-1 pb-1.5' },
    },
  },
}

export default defineAppConfig({
  canopy: {
    releaseNotesUrl: '',
    issuesUrl: '',
  },
  ui: {
    icons: {
      arrowDown: 'i-hugeicons-arrow-down-02',
      arrowLeft: 'i-hugeicons-arrow-left-02',
      arrowRight: 'i-hugeicons-arrow-right-02',
      arrowUp: 'i-hugeicons-arrow-up-02',
      caution: 'i-hugeicons-alert-circle',
      check: 'i-hugeicons-tick-02',
      chevronDoubleLeft: 'i-hugeicons-arrow-left-double',
      chevronDoubleRight: 'i-hugeicons-arrow-right-double',
      chevronDown: 'i-hugeicons-arrow-down-01',
      chevronLeft: 'i-hugeicons-arrow-left-01',
      chevronRight: 'i-hugeicons-arrow-right-01',
      chevronUp: 'i-hugeicons-arrow-up-01',
      close: 'i-hugeicons-cancel-01',
      copy: 'i-hugeicons-copy-01',
      copyCheck: 'i-hugeicons-copy-check',
      dark: 'i-hugeicons-moon-02',
      drag: 'i-hugeicons-drag-drop-vertical',
      ellipsis: 'i-hugeicons-more-horizontal',
      error: 'i-hugeicons-cancel-circle',
      external: 'i-hugeicons-arrow-up-right-01',
      eye: 'i-hugeicons-view',
      eyeOff: 'i-hugeicons-view-off-slash',
      file: 'i-hugeicons-file-01',
      folder: 'i-hugeicons-folder-01',
      folderOpen: 'i-hugeicons-folder-open',
      hash: 'i-hugeicons-hashtag',
      info: 'i-hugeicons-information-circle',
      light: 'i-hugeicons-sun-03',
      loading: 'i-hugeicons-loading-03',
      menu: 'i-hugeicons-menu-01',
      minus: 'i-hugeicons-minus-sign',
      panelClose: 'i-hugeicons-sidebar-left-01',
      panelOpen: 'i-hugeicons-sidebar-left',
      plus: 'i-hugeicons-add-01',
      reload: 'i-hugeicons-rotate-left-01',
      search: 'i-hugeicons-search-01',
      stop: 'i-hugeicons-stop',
      star: 'i-hugeicons-star',
      success: 'i-hugeicons-checkmark-circle-02',
      system: 'i-hugeicons-computer',
      tip: 'i-hugeicons-bulb',
      upload: 'i-hugeicons-upload-01',
      warning: 'i-hugeicons-alert-02',
    },
    colors: {
      primary: 'ochre',
      secondary: 'cobalt-gray',
      info: 'cyan',
      warning: 'amber',
      neutral: 'cobalt-gray',
    },
    button: {
      slots: {
        base: 'rounded-md font-normal cursor-pointer',
      },
      variants: {
        size: {
          xs: { base: 'h-6 px-[9px] py-0 text-[11.5px] gap-1.5' },
          sm: { base: 'h-[28px] px-2.5 py-0 text-[12px] gap-2' },
          md: { base: 'h-[30px] px-3.5 py-0 text-[12px] gap-2.5' },
        },
      },
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'bg-(--inv) text-(--invtx) font-semibold hover:bg-(--inv) hover:opacity-90' },
        { color: 'neutral', variant: 'outline', class: 'ring-(--bb) text-(--tx2) bg-transparent hover:bg-(--hov) hover:text-(--tx)' },
        { color: 'neutral', variant: 'ghost', class: 'text-(--mu) hover:bg-(--hov) hover:text-(--tx)' },
      ],
    },
    dropdownMenu: menu,
    contextMenu: menu,
    popover: {
      slots: {
        content: 'bg-(--modal) ring-0 border border-(--bb) rounded-lg shadow-(--shadow)',
      },
    },
    tooltip: {
      slots: {
        content: 'bg-(--modal) text-(--tx2) ring-0 border border-(--bb) rounded-md h-auto min-h-6 px-2 py-1 text-[11.5px] shadow-(--shadow)',
      },
    },
    modal: {
      slots: {
        overlay: 'bg-(--ovl)',
        content: 'bg-(--modal) ring-0 border border-(--bb) rounded-xl shadow-(--shadow) divide-y-0',
      },
    },
    kbd: {
      base: 'font-[family-name:var(--mono)]',
    },
    toast: {
      slots: {
        root: 'bg-(--modal) ring-0 border border-(--bb) rounded-lg shadow-(--shadow)',
        title: 'text-[13px] font-semibold text-(--tx)',
        description: 'text-[12px] text-(--tx3) leading-[1.4]',
      },
    },
  },
})
