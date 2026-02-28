import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'HZL',
  description:
    'HZL is the shared task ledger for OpenClaw, with durable task state, atomic claiming, and session-safe handoffs.',
  head: [
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'HZL' }],
    ['meta', { property: 'og:title', content: 'HZL | Shared Task Ledger for OpenClaw' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Coordinate OpenClaw agents with durable shared tasks, atomic claiming, and clear human visibility across sessions.',
      },
    ],
    ['meta', { property: 'og:url', content: 'https://hzl-tasks.com/' }],
    ['meta', { property: 'og:image', content: 'https://hzl-tasks.com/og-hzl-tasks.png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'HZL shared task ledger for OpenClaw agents' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'HZL | Shared Task Ledger for OpenClaw' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content:
          'Coordinate OpenClaw agents with durable shared tasks, atomic claiming, and clear human visibility across sessions.',
      },
    ],
    ['meta', { name: 'twitter:image', content: 'https://hzl-tasks.com/og-hzl-tasks.png' }],
  ],
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',
  themeConfig: {
    sidebar: [
      { text: 'Home', link: '/' },
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/getting-started/' },
          { text: 'Installation & OpenClaw Setup', link: '/getting-started/installation' },
          { text: 'Quickstart', link: '/getting-started/quickstart' },
          { text: 'Dashboard', link: '/dashboard' },
        ],
      },
      {
        text: 'Workflows',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/workflows/' },
          { text: 'Single Agent', link: '/workflows/single-agent' },
          { text: 'Multi-Agent', link: '/workflows/multi-agent' },
          { text: 'Session Handoffs', link: '/workflows/session-handoffs' },
          { text: 'Breaking Down Work', link: '/workflows/breaking-down-work' },
          { text: 'Blocking & Unblocking', link: '/workflows/blocking-unblocking' },
          { text: 'Human Oversight', link: '/workflows/human-oversight' },
          { text: 'Project Organization', link: '/workflows/project-organization' },
        ],
      },
      {
        text: 'Concepts',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/concepts/' },
          { text: 'Projects', link: '/concepts/projects' },
          { text: 'Tasks', link: '/concepts/tasks' },
          { text: 'Subtasks', link: '/concepts/subtasks' },
          { text: 'Dependencies', link: '/concepts/dependencies' },
          { text: 'Pruning', link: '/concepts/pruning' },
          { text: 'Checkpoints', link: '/concepts/checkpoints' },
          { text: 'Claiming & Leases', link: '/concepts/claiming-leases' },
          { text: 'Cloud Sync', link: '/concepts/cloud-sync' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/reference/' },
          { text: 'CLI', link: '/reference/cli' },
          { text: 'Architecture', link: '/reference/architecture' },
        ],
      },
      {
        text: 'Other',
        collapsed: false,
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Experimental Integrations', link: '/experimental-integrations' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/tmchow/hzl' }],
    footer: {
      message: 'HZL - Shared task ledger for OpenClaw',
    },
  },
})
