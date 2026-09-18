# Contributing to JobApply Agent

Thank you for your interest in contributing! This project welcomes contributions from everyone.

## How to Contribute

### Reporting Bugs
1. Check if the bug is already reported in [Issues](https://github.com/Abdullah801953/ai-job-applying-agent/issues)
2. If not, create a new issue using the **Bug Report** template
3. Include steps to reproduce, expected behavior, and actual behavior

### Suggesting Features
1. Check existing issues and discussions
2. Create a new issue using the **Feature Request** template
3. Describe the feature, use case, and potential implementation

### Code Contributions
1. **Fork** the repository
2. **Create a branch** for your changes: `git checkout -b feature/your-feature-name`
3. **Make your changes** following the code style
4. **Test your changes** locally
5. **Submit a Pull Request** with a clear description

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/ai-job-applying-agent.git
cd ai-job-applying-agent

# Install dependencies
npm install
npm --prefix ui install

# Copy env template and add your Groq API key
copy .env.example .env

# Start development servers
npm run dev
```

## Code Style Guidelines

- Use **ESLint** (run `npm run lint` if available)
- Follow existing code patterns in the codebase
- Write clear, descriptive commit messages
- Keep functions small and focused
- Add comments for complex logic

## Pull Request Process

1. Ensure your PR passes any existing tests
2. Update documentation if needed
3. Link related issues in the PR description
4. Request review from maintainers
5. Address feedback promptly

## Commit Message Convention

Use clear, descriptive commit messages:

```
feat: add support for external job applications
fix: handle dropdown selection edge case
docs: update README with new CLI options
refactor: simplify agent-core.js error handling
```

## Areas for Contribution

Check issues labeled **`good first issue`** or **`help wanted`** for beginner-friendly tasks:

- [ ] Improve LinkedIn DOM selectors resilience
- [ ] Add more AI model fallbacks
- [ ] Enhance resume parsing for PDFs
- [ ] Add unit/integration tests
- [ ] Improve mobile UI responsiveness
- [ ] Add scheduling/cron support
- [ ] Implement application tracking dashboard

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Open a [Discussion](https://github.com/Abdullah801953/ai-job-applying-agent/discussions) or ask in an issue.