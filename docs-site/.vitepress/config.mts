import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'HZL Documentation',
  description: 'Shared task ledger for OpenClaw and multi-agent systems',
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
      message: 'HZL - Shared task ledger for OpenClaw and multi-agent systems',
    },
  },
})
