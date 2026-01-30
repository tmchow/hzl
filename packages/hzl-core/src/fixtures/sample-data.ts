export interface SampleTask {
  title: string;
  description?: string;
  tags?: string[];
  priority?: number;
  depends_on_indices?: number[];
  status?: 'backlog' | 'ready' | 'in_progress' | 'done';
  comments?: string[];
  checkpoints?: { name: string; data?: Record<string, unknown> }[];
}

export const SAMPLE_PROJECT_NAME = 'sample-project';

export const SAMPLE_TASKS: SampleTask[] = [
  {
    title: 'Design authentication flow',
    description:
      'Create wireframes and flow diagrams for user authentication including login, signup, password reset, and OAuth.',
    tags: ['epic', 'design', 'auth'],
    priority: 3,
    status: 'done',
    comments: ['Completed initial designs', 'Stakeholder approved'],
  },
  {
    title: 'Implement user registration API',
    description: 'POST /api/auth/register endpoint with email verification',
    tags: ['backend', 'auth', 'api'],
    priority: 2,
    depends_on_indices: [0],
    status: 'done',
    checkpoints: [
      { name: 'endpoint-created', data: { method: 'POST', path: '/api/auth/register' } },
      { name: 'tests-passing', data: { coverage: 95 } },
    ],
  },
  {
    title: 'Implement login API',
    description: 'POST /api/auth/login with JWT token generation',
    tags: ['backend', 'auth', 'api'],
    priority: 2,
    depends_on_indices: [0],
    status: 'in_progress',
    comments: ['Working on token refresh logic'],
  },
  {
    title: 'Add OAuth2 Google provider',
    description: 'Enable "Sign in with Google" using OAuth2 flow',
    tags: ['backend', 'auth', 'oauth'],
    priority: 1,
    depends_on_indices: [1, 2],
    status: 'ready',
  },
  {
    title: 'Build login UI component',
    description: 'React component for login form with validation',
    tags: ['frontend', 'auth', 'ui'],
    priority: 2,
    depends_on_indices: [2],
    status: 'ready',
  },
  {
    title: 'Design dashboard layout',
    description: 'Main dashboard with widgets for key metrics',
    tags: ['epic', 'design', 'dashboard'],
    priority: 2,
    status: 'done',
  },
  {
    title: 'Implement dashboard API',
    description: 'GET /api/dashboard endpoint returning aggregated metrics',
    tags: ['backend', 'dashboard', 'api'],
    priority: 2,
    depends_on_indices: [5],
    status: 'ready',
  },
  {
    title: 'Build metrics widget component',
    description: 'Reusable widget showing key metric with trend indicator',
    tags: ['frontend', 'dashboard', 'ui'],
    priority: 1,
    depends_on_indices: [5],
    status: 'backlog',
  },
  {
    title: 'Add real-time updates to dashboard',
    description: 'WebSocket connection for live metric updates',
    tags: ['frontend', 'backend', 'dashboard', 'realtime'],
    priority: 1,
    depends_on_indices: [6, 7],
    status: 'backlog',
  },
  {
    title: 'Design search experience',
    description: 'Search UI/UX including filters, suggestions, and results display',
    tags: ['epic', 'design', 'search'],
    priority: 2,
    status: 'ready',
  },
  {
    title: 'Implement search indexing',
    description: 'Background job to index content for full-text search',
    tags: ['backend', 'search', 'jobs'],
    priority: 2,
    depends_on_indices: [9],
    status: 'backlog',
  },
  {
    title: 'Build search API',
    description: 'GET /api/search with pagination and filters',
    tags: ['backend', 'search', 'api'],
    priority: 2,
    depends_on_indices: [10],
    status: 'backlog',
  },
  {
    title: 'Create search results component',
    description: 'React component displaying search results with highlighting',
    tags: ['frontend', 'search', 'ui'],
    priority: 1,
    depends_on_indices: [9, 11],
    status: 'backlog',
  },
  {
    title: 'Set up CI/CD pipeline',
    description: 'GitHub Actions workflow for testing, linting, and deployment',
    tags: ['devops', 'ci'],
    priority: 3,
    status: 'done',
  },
  {
    title: 'Configure monitoring and alerting',
    description: 'Set up Datadog/Prometheus for application monitoring',
    tags: ['devops', 'monitoring'],
    priority: 2,
    depends_on_indices: [13],
    status: 'ready',
  },
  {
    title: 'Write API documentation',
    description: 'OpenAPI spec and developer guide',
    tags: ['docs', 'api'],
    priority: 1,
    status: 'backlog',
  },
  {
    title: 'Performance optimization audit',
    description: 'Profile and optimize slow endpoints',
    tags: ['backend', 'performance'],
    priority: 1,
    status: 'backlog',
  },
  {
    title: 'Security audit',
    description: 'Review authentication, authorization, and data protection',
    tags: ['security', 'audit'],
    priority: 3,
    depends_on_indices: [1, 2, 3],
    status: 'backlog',
  },
];
