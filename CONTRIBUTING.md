# Contributing to Team Polling App

Thank you for contributing to the Team Polling App! This document provides guidelines for our team collaboration.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Git Workflow](#git-workflow)
- [Pull Request Process](#pull-request-process)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Format](#commit-message-format)

## Getting Started

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- Git

## Development Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/growthboss-co/voting-website.git
   cd voting-website
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Create your environment file**:

   ```bash
   cp .env.example .env
   ```

4. **Configure your `.env` file** with:
   - `HOST_USERNAME` - Host login username
   - `HOST_PASSWORD` - Host login password
   - `UPSTASH_REDIS_REST_URL` - Your Upstash Redis URL
   - `UPSTASH_REDIS_REST_TOKEN` - Your Upstash Redis token

5. **Start the development server**:

   ```bash
   npm run dev
   ```

6. Open http://localhost:3000 in your browser

## Git Workflow

We use a **feature branch workflow**:

1. **Always branch from `main`**:

   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature-name
   ```

2. **Branch naming conventions**:
   - `feature/` - New features (e.g., `feature/add-timer-display`)
   - `fix/` - Bug fixes (e.g., `fix/voting-timeout-error`)
   - `docs/` - Documentation updates (e.g., `docs/update-readme`)
   - `refactor/` - Code refactoring (e.g., `refactor/cleanup-api-routes`)

3. **Keep branches focused**: One feature or fix per branch

4. **Stay up to date**:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

## Pull Request Process

### Before Creating a PR

1. **Run linting**:

   ```bash
   npm run lint
   ```

2. **Fix any linting errors**:

   ```bash
   npm run lint:fix
   ```

3. **Format your code**:

   ```bash
   npm run format
   ```

4. **Test your changes locally**:
   - Start the dev server and verify functionality
   - Test both host and voter flows

### Creating the PR

1. Push your branch:

   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request on GitHub with:
   - Clear, descriptive title
   - Description of what changes were made and why
   - Any testing instructions
   - Screenshots for UI changes

### PR Requirements

- [ ] Code passes linting (`npm run lint`)
- [ ] Code is formatted (`npm run format:check`)
- [ ] At least 1 approval from a team member
- [ ] All discussions resolved
- [ ] Branch is up to date with main

### After PR is Merged

Delete your feature branch:

```bash
git checkout main
git pull origin main
git branch -d feature/your-feature-name
```

## Code Style Guidelines

### JavaScript

We use ESLint and Prettier to enforce consistent code style:

- **Semicolons**: Always use semicolons
- **Quotes**: Use single quotes for strings
- **Indentation**: 2 spaces
- **Variables**: Prefer `const` over `let`, never use `var`
- **Equality**: Always use strict equality (`===` and `!==`)

### File Organization

```
voting-website/
├── api/              # Serverless API functions (Vercel)
├── public/
│   ├── css/          # Stylesheets
│   ├── js/           # Browser JavaScript
│   ├── images/       # Static images
│   └── audio/        # Audio files
├── views/            # HTML templates
└── server.js         # Local development server
```

### Naming Conventions

- **Files**: lowercase with hyphens (e.g., `host-login.js`)
- **Functions**: camelCase (e.g., `displayPoll`, `handleDragStart`)
- **Constants**: UPPER_SNAKE_CASE for true constants
- **CSS Classes**: lowercase with hyphens (e.g., `.poll-item`, `.btn-primary`)

## Commit Message Format

Use clear, descriptive commit messages:

```
<type>: <short summary>

[optional body with more details]
```

**Types**:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, semicolons)
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

**Examples**:

```
feat: add countdown timer to voting screen

fix: prevent duplicate votes on rapid clicks

docs: update README with deployment instructions

style: format all JS files with prettier
```

## GitHub Branch Protection

Our `main` branch is protected with the following rules:

- Requires pull request before merging
- Requires at least 1 approval
- Stale approvals are dismissed when new commits are pushed
- Conversations must be resolved before merging

## Questions?

If you have questions about contributing, reach out to the team!
