# CodeCompanion Development Setup Guide

## 🚀 Quick Start

This guide will help you set up the CodeCompanion development environment and get started with contributing to the project.

## 📋 Prerequisites

### Required Software
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **VS Code** ([Download](https://code.visualstudio.com/))
- **Git** ([Download](https://git-scm.com/))
- **Ollama** ([Download](https://ollama.ai/))

### Recommended Software
- **TypeScript** (installed globally): `npm install -g typescript`
- **ESLint** (installed globally): `npm install -g eslint`

## 🔧 Installation Steps

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/code-companion.git
cd code-companion
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Install Ollama
Follow the official installation guide for your platform:
- **macOS**: `brew install ollama`
- **Linux**: `curl -fsSL https://ollama.ai/install.sh | sh`
- **Windows**: Download from [ollama.ai](https://ollama.ai/)

### 4. Download a Coding Model
```bash
# Start Ollama service
ollama serve

# Download a recommended model (in a new terminal)
ollama pull codellama:70b

# Alternative models you can try:
# ollama pull deepseek-coder:6.7b
# ollama pull wizardcoder:7b
# ollama pull llama3.1:8b
```

### 5. Build the Extension
```bash
npm run compile
```

### 6. Run in Development Mode
```bash
npm run watch
```

## 🎯 Development Workflow

### Starting Development
1. **Start Ollama**: Ensure Ollama is running with `ollama serve`
2. **Start Watch Mode**: Run `npm run watch` to compile on changes
3. **Open Extension**: Press `F5` in VS Code to open extension development host
4. **Test Changes**: Use the extension in the development host

### Development Commands
```bash
# Compile TypeScript
npm run compile

# Watch for changes and recompile
npm run watch

# Run linting
npm run lint

# Run tests
npm test

# Package extension for distribution
npm run package
```

## 🏗️ Project Structure

```
code-companion/
├── src/                    # Source code
│   ├── extension.ts       # Main extension entry point
│   ├── manager.ts         # Core manager class
│   ├── types.ts           # TypeScript type definitions
│   ├── agent/             # AI agent components
│   │   ├── planner.ts     # Task planning
│   │   ├── context.ts     # Context analysis
│   │   ├── executor.ts    # Code execution
│   │   └── safety.ts      # Safety validation
│   ├── llm/               # LLM integration
│   │   ├── ollama.ts      # Ollama client
│   │   ├── models.ts      # Model configuration
│   │   └── prompts.ts     # Prompt templates
│   ├── ui/                # User interface
│   │   ├── chat.ts        # Chat panel
│   │   ├── tasks.ts       # Task panel
│   │   └── status.ts      # Status bar
│   └── utils/             # Utilities
│       ├── fs.ts          # File system operations
│       ├── git.ts         # Git integration
│       └── ast.ts         # AST parsing
├── out/                   # Compiled JavaScript
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
├── .eslintrc.js           # ESLint configuration
└── README.md              # Project documentation
```

## 🔧 Configuration

### VS Code Settings
Create `.vscode/settings.json` in your workspace:
```json
{
    "codeCompanion.ollamaUrl": "http://localhost:11434",
    "codeCompanion.defaultModel": "codellama:70b",
    "codeCompanion.maxTokens": 4096,
    "codeCompanion.temperature": 0.1,
    "codeCompanion.enableAutoSave": true,
    "codeCompanion.confirmChanges": true,
    "codeCompanion.maxConcurrentTasks": 3
}
```

### Environment Variables
Create `.env` file for local development:
```env
OLLAMA_URL=http://localhost:11434
DEFAULT_MODEL=codellama:70b
DEBUG_MODE=true
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --grep "Task Planning"

# Run with coverage
npm run test:coverage
```

### Test Structure
```
tests/
├── unit/                  # Unit tests
│   ├── agent/            # Agent component tests
│   ├── llm/              # LLM integration tests
│   └── ui/               # UI component tests
├── integration/          # Integration tests
└── e2e/                 # End-to-end tests
```

### Writing Tests
```typescript
// Example test structure
import * as assert from 'assert';
import { TaskPlanner } from '../../src/agent/planner';

suite('Task Planner Tests', () => {
    test('should create plan for refactoring task', async () => {
        const planner = new TaskPlanner(mockOllamaClient);
        const plan = await planner.createPlan('refactor', {
            code: 'function test() { return true; }',
            filePath: '/test/file.js'
        }, mockContext);
        
        assert.strictEqual(plan.steps.length > 0, true);
        assert.strictEqual(plan.steps[0].type, 'analysis');
    });
});
```

## 🐛 Debugging

### Debugging the Extension
1. Set breakpoints in your TypeScript code
2. Press `F5` to start debugging
3. Use the extension in the development host
4. Check the Debug Console for logs

### Debugging Ollama Integration
```typescript
// Add debug logging
console.log('Ollama request:', { model, prompt });
console.log('Ollama response:', response);
```

### Common Issues

#### Ollama Connection Issues
```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Restart Ollama
ollama serve

# Check model availability
ollama list
```

#### Extension Not Loading
1. Check the Developer Tools console (Help > Toggle Developer Tools)
2. Verify all dependencies are installed
3. Ensure TypeScript compilation succeeded
4. Check for syntax errors in the code

#### LLM Response Issues
1. Verify model is downloaded: `ollama list`
2. Check model size and available memory
3. Try a smaller model for testing
4. Check Ollama logs for errors

## 📝 Code Style

### TypeScript Guidelines
- Use strict TypeScript configuration
- Prefer interfaces over types for object shapes
- Use proper error handling with typed errors
- Document complex functions with JSDoc

### Code Formatting
```bash
# Format code with Prettier
npm run format

# Check formatting
npm run format:check
```

### Linting
```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix
```

## 🔄 Contributing

### Development Workflow
1. **Create Feature Branch**: `git checkout -b feature/your-feature`
2. **Make Changes**: Implement your feature
3. **Add Tests**: Write tests for new functionality
4. **Run Tests**: Ensure all tests pass
5. **Update Documentation**: Update relevant docs
6. **Submit PR**: Create pull request with description

### Commit Message Format
```
type(scope): description

feat(agent): add new task planning algorithm
fix(ui): resolve chat panel rendering issue
docs(readme): update installation instructions
test(planner): add unit tests for plan validation
```

### Pull Request Guidelines
- Include clear description of changes
- Add tests for new functionality
- Update documentation if needed
- Ensure all CI checks pass
- Request review from maintainers

## 🚀 Deployment

### Building for Production
```bash
# Build extension
npm run compile

# Package extension
npm run package

# The .vsix file will be created in the root directory
```

### Publishing to Marketplace
1. Create publisher account on VS Code Marketplace
2. Update `package.json` with publisher information
3. Run `vsce publish` to publish extension
4. Update version number for each release

## 📚 Additional Resources

### Documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Ollama Documentation](https://ollama.ai/docs)
- [Node.js Documentation](https://nodejs.org/docs/)

### Community
- [VS Code Extension Community](https://github.com/microsoft/vscode-extension-samples)
- [TypeScript Community](https://github.com/microsoft/TypeScript)
- [Ollama Community](https://github.com/ollama/ollama)

### Tools
- [VS Code Extension Generator](https://github.com/Microsoft/vscode-generator-code)
- [TypeScript Playground](https://www.typescriptlang.org/play)
- [Ollama Model Library](https://ollama.ai/library)

## 🆘 Getting Help

### Common Questions
1. **Extension not working**: Check Developer Tools console
2. **LLM not responding**: Verify Ollama is running and model is downloaded
3. **Build errors**: Run `npm run compile` and check for TypeScript errors
4. **Test failures**: Check test output and verify test environment

### Support Channels
- [GitHub Issues](https://github.com/your-username/code-companion/issues)
- [Discord Community](https://discord.gg/codecompanion)
- [Documentation](https://codecompanion.dev)

---

Happy coding! 🚀 If you have any questions or need help, don't hesitate to reach out to the community. 