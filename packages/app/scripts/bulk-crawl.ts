/**
 * Bulk crawl script — uses the /api/crawl endpoint for docs sites
 * that don't have llms.txt files. The crawl endpoint uses Cloudflare
 * Browser Rendering to extract content from web pages.
 */

const API_URL = process.env.JEREMY_API_URL ?? "https://jeremy.khuur.dev";
const API_KEY = process.env.JEREMY_API_KEY ?? "";
const DELAY_BETWEEN_LIBRARIES_MS = 12000; // 12s between libraries (crawl is heavier + rate limit)

interface CrawlLibrary {
  id: string;
  name: string;
  description: string;
  urls: string[];
}

const LIBRARIES: CrawlLibrary[] = [
  // ── CSS / Styling ─────────────────────────────────────────────────
  {
    id: "/tailwindlabs/tailwindcss",
    name: "Tailwind CSS",
    description: "Utility-first CSS framework",
    urls: [
      "https://tailwindcss.com/docs/installation",
      "https://tailwindcss.com/docs/configuration",
      "https://tailwindcss.com/docs/utility-first",
      "https://tailwindcss.com/docs/responsive-design",
    ],
  },
  {
    id: "/styled-components/styled-components",
    name: "Styled Components",
    description: "CSS-in-JS for React",
    urls: [
      "https://styled-components.com/docs",
      "https://styled-components.com/docs/basics",
      "https://styled-components.com/docs/advanced",
    ],
  },

  // ── Testing ───────────────────────────────────────────────────────
  {
    id: "/microsoft/playwright",
    name: "Playwright",
    description: "End-to-end testing for modern web apps",
    urls: [
      "https://playwright.dev/docs/intro",
      "https://playwright.dev/docs/writing-tests",
      "https://playwright.dev/docs/api/class-page",
      "https://playwright.dev/docs/test-assertions",
    ],
  },
  {
    id: "/cypress-io/cypress",
    name: "Cypress",
    description: "JavaScript end-to-end testing framework",
    urls: [
      "https://docs.cypress.io/app/get-started/why-cypress",
      "https://docs.cypress.io/app/get-started/install-cypress",
      "https://docs.cypress.io/api/commands/get",
    ],
  },
  {
    id: "/jestjs/jest",
    name: "Jest",
    description: "JavaScript testing framework",
    urls: [
      "https://jestjs.io/docs/getting-started",
      "https://jestjs.io/docs/expect",
      "https://jestjs.io/docs/mock-functions",
      "https://jestjs.io/docs/configuration",
    ],
  },
  {
    id: "/testing-library/testing-library",
    name: "Testing Library",
    description: "Simple testing utilities for DOM and frameworks",
    urls: [
      "https://testing-library.com/docs/",
      "https://testing-library.com/docs/react-testing-library/intro",
      "https://testing-library.com/docs/queries/about",
    ],
  },

  // ── Backend Frameworks ────────────────────────────────────────────
  {
    id: "/expressjs/express",
    name: "Express.js",
    description: "Fast, minimalist web framework for Node.js",
    urls: [
      "https://expressjs.com/en/starter/installing.html",
      "https://expressjs.com/en/guide/routing.html",
      "https://expressjs.com/en/guide/using-middleware.html",
      "https://expressjs.com/en/4x/api.html",
    ],
  },
  {
    id: "/nestjs/nest",
    name: "NestJS",
    description: "Progressive Node.js framework for server-side apps",
    urls: [
      "https://docs.nestjs.com/",
      "https://docs.nestjs.com/controllers",
      "https://docs.nestjs.com/providers",
      "https://docs.nestjs.com/modules",
    ],
  },
  {
    id: "/tiangolo/fastapi",
    name: "FastAPI",
    description: "Modern Python web framework for APIs",
    urls: [
      "https://fastapi.tiangolo.com/",
      "https://fastapi.tiangolo.com/tutorial/first-steps/",
      "https://fastapi.tiangolo.com/tutorial/path-params/",
      "https://fastapi.tiangolo.com/tutorial/query-params/",
    ],
  },
  {
    id: "/django/django",
    name: "Django",
    description: "High-level Python web framework",
    urls: [
      "https://docs.djangoproject.com/en/5.1/intro/overview/",
      "https://docs.djangoproject.com/en/5.1/intro/tutorial01/",
      "https://docs.djangoproject.com/en/5.1/topics/db/models/",
      "https://docs.djangoproject.com/en/5.1/topics/http/views/",
    ],
  },
  {
    id: "/pallets/flask",
    name: "Flask",
    description: "Lightweight Python web framework",
    urls: [
      "https://flask.palletsprojects.com/en/stable/quickstart/",
      "https://flask.palletsprojects.com/en/stable/tutorial/",
      "https://flask.palletsprojects.com/en/stable/api/",
    ],
  },
  {
    id: "/rails/rails",
    name: "Ruby on Rails",
    description: "Full-stack Ruby web framework",
    urls: [
      "https://guides.rubyonrails.org/getting_started.html",
      "https://guides.rubyonrails.org/active_record_basics.html",
      "https://guides.rubyonrails.org/routing.html",
      "https://guides.rubyonrails.org/action_controller_overview.html",
    ],
  },
  {
    id: "/laravel/laravel",
    name: "Laravel",
    description: "PHP web application framework",
    urls: [
      "https://laravel.com/docs/11.x/installation",
      "https://laravel.com/docs/11.x/routing",
      "https://laravel.com/docs/11.x/controllers",
      "https://laravel.com/docs/11.x/eloquent",
    ],
  },

  // ── State Management ──────────────────────────────────────────────
  {
    id: "/reduxjs/redux-toolkit",
    name: "Redux Toolkit",
    description: "Official toolset for efficient Redux development",
    urls: [
      "https://redux-toolkit.js.org/introduction/getting-started",
      "https://redux-toolkit.js.org/tutorials/quick-start",
      "https://redux-toolkit.js.org/api/createSlice",
      "https://redux-toolkit.js.org/rtk-query/overview",
    ],
  },
  {
    id: "/pmndrs/jotai",
    name: "Jotai",
    description: "Primitive and flexible state management for React",
    urls: [
      "https://jotai.org/docs/introduction",
      "https://jotai.org/docs/core/atom",
      "https://jotai.org/docs/core/use-atom",
      "https://jotai.org/docs/guides/persistence",
    ],
  },

  // ── GraphQL ───────────────────────────────────────────────────────
  {
    id: "/apollographql/apollo",
    name: "Apollo GraphQL",
    description: "GraphQL client and server platform",
    urls: [
      "https://www.apollographql.com/docs/react/get-started",
      "https://www.apollographql.com/docs/react/data/queries",
      "https://www.apollographql.com/docs/react/data/mutations",
      "https://www.apollographql.com/docs/apollo-server/getting-started",
    ],
  },

  // ── Auth ──────────────────────────────────────────────────────────
  {
    id: "/nextauthjs/next-auth",
    name: "Auth.js (NextAuth)",
    description: "Authentication for the web",
    urls: [
      "https://authjs.dev/getting-started",
      "https://authjs.dev/getting-started/providers",
      "https://authjs.dev/getting-started/session-management",
      "https://authjs.dev/getting-started/database",
    ],
  },

  // ── DevOps / Infra ────────────────────────────────────────────────
  {
    id: "/kubernetes/kubernetes",
    name: "Kubernetes",
    description: "Container orchestration platform",
    urls: [
      "https://kubernetes.io/docs/concepts/overview/",
      "https://kubernetes.io/docs/concepts/workloads/pods/",
      "https://kubernetes.io/docs/concepts/services-networking/service/",
      "https://kubernetes.io/docs/tutorials/kubernetes-basics/",
    ],
  },
  {
    id: "/hashicorp/terraform",
    name: "Terraform",
    description: "Infrastructure as code tool",
    urls: [
      "https://developer.hashicorp.com/terraform/intro",
      "https://developer.hashicorp.com/terraform/tutorials/aws-get-started",
      "https://developer.hashicorp.com/terraform/language",
    ],
  },
  {
    id: "/features/actions",
    name: "GitHub Actions",
    description: "CI/CD automation in GitHub",
    urls: [
      "https://docs.github.com/en/actions/learn-github-actions/understanding-github-actions",
      "https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions",
      "https://docs.github.com/en/actions/quickstart",
    ],
  },

  // ── Animation ─────────────────────────────────────────────────────
  {
    id: "/motiondivision/motion",
    name: "Motion (Framer Motion)",
    description: "Production-ready animation library for React",
    urls: [
      "https://motion.dev/docs/react-quick-start",
      "https://motion.dev/docs/react-animation",
      "https://motion.dev/docs/react-gestures",
      "https://motion.dev/docs/react-layout-animations",
    ],
  },

  // ── DX / Build Tools ──────────────────────────────────────────────
  {
    id: "/pnpm/pnpm",
    name: "pnpm",
    description: "Fast, disk space efficient package manager",
    urls: [
      "https://pnpm.io/motivation",
      "https://pnpm.io/installation",
      "https://pnpm.io/cli/install",
      "https://pnpm.io/workspaces",
    ],
  },
  {
    id: "/biomejs/biome",
    name: "Biome",
    description: "Fast formatter and linter for JavaScript/TypeScript",
    urls: [
      "https://biomejs.dev/guides/getting-started/",
      "https://biomejs.dev/linter/",
      "https://biomejs.dev/formatter/",
      "https://biomejs.dev/reference/configuration/",
    ],
  },
  {
    id: "/eslint/eslint",
    name: "ESLint",
    description: "Pluggable JavaScript/TypeScript linter",
    urls: [
      "https://eslint.org/docs/latest/use/getting-started",
      "https://eslint.org/docs/latest/use/configure/",
      "https://eslint.org/docs/latest/rules/",
    ],
  },
  {
    id: "/evanw/esbuild",
    name: "esbuild",
    description: "Extremely fast JavaScript bundler",
    urls: [
      "https://esbuild.github.io/getting-started/",
      "https://esbuild.github.io/api/",
      "https://esbuild.github.io/content-types/",
    ],
  },
  {
    id: "/webpack/webpack",
    name: "Webpack",
    description: "Module bundler for JavaScript",
    urls: [
      "https://webpack.js.org/concepts/",
      "https://webpack.js.org/guides/getting-started/",
      "https://webpack.js.org/configuration/",
      "https://webpack.js.org/loaders/",
    ],
  },

  // ── Databases ─────────────────────────────────────────────────────
  {
    id: "/mongodb/mongodb",
    name: "MongoDB",
    description: "Document-oriented NoSQL database",
    urls: [
      "https://www.mongodb.com/docs/manual/introduction/",
      "https://www.mongodb.com/docs/manual/crud/",
      "https://www.mongodb.com/docs/manual/aggregation/",
      "https://www.mongodb.com/docs/drivers/node/current/quick-start/",
    ],
  },

  // ── Charting / Visualization ──────────────────────────────────────
  {
    id: "/d3/d3",
    name: "D3.js",
    description: "Data-driven document manipulation library",
    urls: [
      "https://d3js.org/getting-started",
      "https://d3js.org/d3-selection",
      "https://d3js.org/d3-scale",
      "https://d3js.org/d3-shape",
    ],
  },
  {
    id: "/recharts/recharts",
    name: "Recharts",
    description: "React charting library built on D3",
    urls: [
      "https://recharts.org/en-US/guide",
      "https://recharts.org/en-US/api",
    ],
  },
  {
    id: "/chartjs/chart.js",
    name: "Chart.js",
    description: "Simple HTML5 charts using canvas",
    urls: [
      "https://www.chartjs.org/docs/latest/getting-started/",
      "https://www.chartjs.org/docs/latest/charts/line.html",
      "https://www.chartjs.org/docs/latest/charts/bar.html",
      "https://www.chartjs.org/docs/latest/configuration/",
    ],
  },

  // ── Desktop / Mobile ──────────────────────────────────────────────
  {
    id: "/electron/electron",
    name: "Electron",
    description: "Build cross-platform desktop apps with web tech",
    urls: [
      "https://www.electronjs.org/docs/latest/tutorial/quick-start",
      "https://www.electronjs.org/docs/latest/api/app",
      "https://www.electronjs.org/docs/latest/api/browser-window",
      "https://www.electronjs.org/docs/latest/tutorial/ipc",
    ],
  },
  {
    id: "/ionic-team/capacitor",
    name: "Capacitor",
    description: "Cross-platform native runtime for web apps",
    urls: [
      "https://capacitorjs.com/docs/getting-started",
      "https://capacitorjs.com/docs/basics/workflow",
      "https://capacitorjs.com/docs/plugins",
    ],
  },
  {
    id: "/flutter/flutter",
    name: "Flutter",
    description: "Google's UI toolkit for mobile, web, and desktop",
    urls: [
      "https://docs.flutter.dev/get-started/install",
      "https://docs.flutter.dev/development/ui/widgets-intro",
      "https://docs.flutter.dev/cookbook",
    ],
  },

  // ── AI/ML (Python) ────────────────────────────────────────────────
  {
    id: "/pytorch/pytorch",
    name: "PyTorch",
    description: "Open source machine learning framework",
    urls: [
      "https://pytorch.org/tutorials/beginner/basics/intro.html",
      "https://pytorch.org/docs/stable/torch.html",
      "https://pytorch.org/docs/stable/nn.html",
    ],
  },
  {
    id: "/tensorflow/tensorflow",
    name: "TensorFlow",
    description: "End-to-end open source ML platform",
    urls: [
      "https://www.tensorflow.org/tutorials/quickstart/beginner",
      "https://www.tensorflow.org/guide/basics",
      "https://www.tensorflow.org/api_docs/python/tf",
    ],
  },
  {
    id: "/wandb/wandb",
    name: "Weights & Biases",
    description: "ML experiment tracking and model management",
    urls: [
      "https://docs.wandb.ai/quickstart",
      "https://docs.wandb.ai/guides/track",
      "https://docs.wandb.ai/guides/sweeps",
    ],
  },
  {
    id: "/scikit-learn/scikit-learn",
    name: "scikit-learn",
    description: "Machine learning in Python",
    urls: [
      "https://scikit-learn.org/stable/getting_started.html",
      "https://scikit-learn.org/stable/user_guide.html",
      "https://scikit-learn.org/stable/tutorial/basic/tutorial.html",
    ],
  },

  // ── Other Popular ─────────────────────────────────────────────────
  {
    id: "/remix-run/react-router",
    name: "React Router",
    description: "Declarative routing for React (includes Remix)",
    urls: [
      "https://reactrouter.com/start/framework/installation",
      "https://reactrouter.com/start/framework/routing",
      "https://reactrouter.com/start/framework/data-loading",
      "https://reactrouter.com/start/framework/actions",
    ],
  },
  {
    id: "/facebook/docusaurus",
    name: "Docusaurus",
    description: "Documentation website generator",
    urls: [
      "https://docusaurus.io/docs",
      "https://docusaurus.io/docs/creating-pages",
      "https://docusaurus.io/docs/markdown-features",
    ],
  },
  {
    id: "/socketio/socket.io",
    name: "Socket.io",
    description: "Real-time bidirectional event-based communication",
    urls: [
      "https://socket.io/docs/v4/",
      "https://socket.io/docs/v4/server-api/",
      "https://socket.io/docs/v4/client-api/",
    ],
  },
  {
    id: "/mdx-js/mdx",
    name: "MDX",
    description: "Markdown for the component era",
    urls: [
      "https://mdxjs.com/docs/what-is-mdx/",
      "https://mdxjs.com/docs/using-mdx/",
      "https://mdxjs.com/docs/getting-started/",
    ],
  },

  // ── Go Frameworks ─────────────────────────────────────────────────
  {
    id: "/gin-gonic/gin",
    name: "Gin",
    description: "HTTP web framework for Go",
    urls: [
      "https://gin-gonic.com/docs/quickstart/",
      "https://gin-gonic.com/docs/examples/",
    ],
  },
  {
    id: "/gofiber/fiber",
    name: "Fiber",
    description: "Express-inspired web framework for Go",
    urls: [
      "https://docs.gofiber.io/",
      "https://docs.gofiber.io/guide/routing",
      "https://docs.gofiber.io/api/app",
    ],
  },

  // ── Rust ──────────────────────────────────────────────────────────
  {
    id: "/tokio-rs/axum",
    name: "Axum",
    description: "Ergonomic web framework for Rust built on Tokio",
    urls: [
      "https://docs.rs/axum/latest/axum/",
    ],
  },
  {
    id: "/tokio-rs/tokio",
    name: "Tokio",
    description: "Async runtime for Rust",
    urls: [
      "https://tokio.rs/tokio/tutorial",
      "https://tokio.rs/tokio/tutorial/hello-tokio",
      "https://tokio.rs/tokio/tutorial/spawning",
    ],
  },

  // ── Batch 3: Languages / Runtimes ──────────────────────────────────
  {
    id: "/microsoft/typescript",
    name: "TypeScript",
    description: "Typed JavaScript at any scale",
    urls: ["https://www.typescriptlang.org/docs/handbook/2/basic-types.html"],
  },
  {
    id: "/nodejs/node",
    name: "Node.js",
    description: "JavaScript runtime built on V8",
    urls: ["https://nodejs.org/docs/latest/api/"],
  },
  {
    id: "/python/cpython",
    name: "Python",
    description: "General-purpose programming language",
    urls: ["https://docs.python.org/3/tutorial/index.html"],
  },
  {
    id: "/golang/go",
    name: "Go",
    description: "Statically typed compiled language",
    urls: ["https://go.dev/doc/effective_go"],
  },
  {
    id: "/rust-lang/rust",
    name: "Rust",
    description: "Systems programming language",
    urls: ["https://doc.rust-lang.org/book/"],
  },

  // ── Databases ──────────────────────────────────────────────────────
  {
    id: "/postgres/postgresql",
    name: "PostgreSQL",
    description: "Advanced open source relational database",
    urls: ["https://www.postgresql.org/docs/current/tutorial.html"],
  },
  {
    id: "/mysql/mysql",
    name: "MySQL",
    description: "Popular open source relational database",
    urls: ["https://dev.mysql.com/doc/refman/8.0/en/tutorial.html"],
  },

  // ── Frontend Frameworks ────────────────────────────────────────────
  {
    id: "/bigskysoftware/htmx",
    name: "HTMX",
    description: "High power tools for HTML",
    urls: ["https://htmx.org/docs/"],
  },
  {
    id: "/alpinejs/alpine",
    name: "Alpine.js",
    description: "Lightweight reactive framework",
    urls: ["https://alpinejs.dev/start-here"],
  },
  {
    id: "/QwikDev/qwik",
    name: "Qwik",
    description: "Resumable JavaScript framework",
    urls: ["https://qwik.dev/docs/"],
  },
  {
    id: "/lit/lit",
    name: "Lit",
    description: "Simple web components library",
    urls: ["https://lit.dev/docs/"],
  },

  // ── Backend (JVM / .NET / Elixir) ─────────────────────────────────
  {
    id: "/spring-projects/spring-boot",
    name: "Spring Boot",
    description: "Java framework for production apps",
    urls: ["https://docs.spring.io/spring-boot/reference/"],
  },
  {
    id: "/phoenixframework/phoenix",
    name: "Phoenix",
    description: "Elixir web framework",
    urls: ["https://hexdocs.pm/phoenix/overview.html"],
  },
  {
    id: "/dotnet/aspnetcore",
    name: "ASP.NET Core",
    description: ".NET web framework",
    urls: ["https://learn.microsoft.com/en-us/aspnet/core/introduction-to-aspnet-core"],
  },

  // ── ORMs / Query Builders ──────────────────────────────────────────
  {
    id: "/Automattic/mongoose",
    name: "Mongoose",
    description: "MongoDB object modeling for Node.js",
    urls: ["https://mongoosejs.com/docs/guide.html"],
  },
  {
    id: "/sequelize/sequelize",
    name: "Sequelize",
    description: "Node.js ORM for SQL databases",
    urls: ["https://sequelize.org/docs/v6/getting-started/"],
  },
  {
    id: "/knex/knex",
    name: "Knex.js",
    description: "SQL query builder for Node.js",
    urls: ["https://knexjs.org/guide/"],
  },

  // ── State Management ───────────────────────────────────────────────
  {
    id: "/statelyai/xstate",
    name: "XState",
    description: "State machines and statecharts for JavaScript",
    urls: ["https://stately.ai/docs/xstate"],
  },
  {
    id: "/ReactiveX/rxjs",
    name: "RxJS",
    description: "Reactive extensions for JavaScript",
    urls: ["https://rxjs.dev/guide/overview"],
  },
  {
    id: "/immerjs/immer",
    name: "Immer",
    description: "Create immutable state by mutating",
    urls: ["https://immerjs.github.io/immer/"],
  },
  {
    id: "/mobxjs/mobx",
    name: "MobX",
    description: "Simple, scalable state management",
    urls: ["https://mobx.js.org/README.html"],
  },

  // ── Search Engines ─────────────────────────────────────────────────
  {
    id: "/elastic/elasticsearch",
    name: "Elasticsearch",
    description: "Distributed search and analytics engine",
    urls: ["https://www.elastic.co/guide/en/elasticsearch/reference/current/getting-started.html"],
  },
  {
    id: "/typesense/typesense",
    name: "Typesense",
    description: "Open source search engine",
    urls: ["https://typesense.org/docs/guide/"],
  },

  // ── Observability ──────────────────────────────────────────────────
  {
    id: "/getsentry/sentry",
    name: "Sentry",
    description: "Application monitoring and error tracking",
    urls: ["https://docs.sentry.io/platforms/javascript/"],
  },
  {
    id: "/open-telemetry/opentelemetry",
    name: "OpenTelemetry",
    description: "Observability framework",
    urls: ["https://opentelemetry.io/docs/"],
  },
  {
    id: "/prometheus/prometheus",
    name: "Prometheus",
    description: "Monitoring and alerting toolkit",
    urls: ["https://prometheus.io/docs/introduction/overview/"],
  },
  {
    id: "/grafana/grafana",
    name: "Grafana",
    description: "Observability dashboards",
    urls: ["https://grafana.com/docs/grafana/latest/getting-started/"],
  },

  // ── Message Queues ─────────────────────────────────────────────────
  {
    id: "/rabbitmq/rabbitmq",
    name: "RabbitMQ",
    description: "Open source message broker",
    urls: ["https://www.rabbitmq.com/tutorials"],
  },
  {
    id: "/apache/kafka",
    name: "Apache Kafka",
    description: "Distributed event streaming platform",
    urls: ["https://kafka.apache.org/documentation/"],
  },

  // ── CMS ────────────────────────────────────────────────────────────
  {
    id: "/contentful/contentful",
    name: "Contentful",
    description: "API-first content platform",
    urls: ["https://www.contentful.com/developers/docs/"],
  },
  {
    id: "/directus/directus",
    name: "Directus",
    description: "Open data platform / headless CMS",
    urls: ["https://docs.directus.io/getting-started/introduction.html"],
  },
  {
    id: "/keystonejs/keystone",
    name: "KeystoneJS",
    description: "Headless CMS and GraphQL API for Node.js",
    urls: ["https://keystonejs.com/docs"],
  },

  // ── API / Dev Tools ────────────────────────────────────────────────
  {
    id: "/OAI/openapi",
    name: "OpenAPI (Swagger)",
    description: "API specification standard",
    urls: ["https://swagger.io/docs/specification/about/"],
  },

  // ── Build Tools ────────────────────────────────────────────────────
  {
    id: "/microsoft/rushstack",
    name: "Rush.js",
    description: "Scalable monorepo manager",
    urls: ["https://rushjs.io/pages/intro/welcome/"],
  },

  // ── Real-time / Multiplayer ────────────────────────────────────────
  {
    id: "/partykit/partykit",
    name: "PartyKit",
    description: "Real-time multiplayer infrastructure",
    urls: ["https://docs.partykit.io/"],
  },
  {
    id: "/pusher/pusher",
    name: "Pusher",
    description: "Real-time messaging API",
    urls: ["https://pusher.com/docs/channels/getting_started/javascript/"],
  },

  // ── Utilities ──────────────────────────────────────────────────────
  {
    id: "/iamkun/dayjs",
    name: "Day.js",
    description: "Minimalist date library",
    urls: ["https://day.js.org/docs/en/installation/installation"],
  },
  {
    id: "/lodash/lodash",
    name: "Lodash",
    description: "JavaScript utility library",
    urls: ["https://lodash.com/docs/"],
  },

  // ── Platforms ──────────────────────────────────────────────────────
  {
    id: "/superfly/fly.io",
    name: "Fly.io",
    description: "Global application platform",
    urls: ["https://fly.io/docs/"],
  },
];

async function crawlLibrary(lib: CrawlLibrary): Promise<{ success: boolean; error?: string }> {
  const tag = `[${lib.name}]`;
  console.log(`${tag} Crawling ${lib.urls.length} URL(s)...`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000); // 3 min timeout for crawling

    const res = await fetch(`${API_URL}/api/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        libraryId: lib.id,
        name: lib.name,
        description: lib.description,
        urls: lib.urls,
        replace: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `API ${res.status}: ${err.slice(0, 200)}` };
    }

    const result = await res.json() as Record<string, unknown>;
    console.log(`${tag} Crawled: ${JSON.stringify(result)}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Unknown error" };
  }
}

async function main() {
  if (!API_KEY) {
    console.error("JEREMY_API_KEY environment variable is required");
    process.exit(1);
  }

  console.log(`\nBulk crawling ${LIBRARIES.length} libraries into Jeremy\n`);

  const results: { name: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < LIBRARIES.length; i++) {
    const lib = LIBRARIES[i];
    const result = await crawlLibrary(lib);
    const icon = result.success ? "OK" : "FAIL";
    console.log(`[${icon}] [${i + 1}/${LIBRARIES.length}] ${lib.name}${result.error ? `: ${result.error}` : ""}`);
    results.push({ name: lib.name, ...result });

    // Delay between libraries to avoid rate limiting
    if (i < LIBRARIES.length - 1) {
      console.log(`  Waiting ${DELAY_BETWEEN_LIBRARIES_MS / 1000}s before next library...`);
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_LIBRARIES_MS));
    }
  }

  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Succeeded: ${succeeded.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`Failed: ${failed.length}`);
    for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
  }
}

main().catch(console.error);
