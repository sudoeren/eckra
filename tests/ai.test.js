const axios = require('axios');
const { generateCommitMessage } = require('../src/helpers/ai');
const configHelper = require('../src/helpers/config');

jest.mock('axios');
jest.mock('../src/helpers/config');

describe('AI Helper', () => {
  const mockDiff = 'diff content';
  const mockFiles = ['file1.js'];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should call OpenAI API correctly', async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: 'openai',
      openaiApiKey: 'sk-test',
      openaiModel: 'gpt-4o'
    });

    axios.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'feat: openai commit' } }]
      }
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe('feat: openai commit');
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-4o',
        messages: expect.any(Array)
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test'
        })
      })
    );
  });

  test('should call Anthropic API correctly', async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: 'anthropic',
      anthropicApiKey: 'sk-ant-test',
      anthropicModel: 'claude-3'
    });

    axios.post.mockResolvedValue({
      data: {
        content: [{ text: 'feat: anthropic commit' }]
      }
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe('feat: anthropic commit');
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        model: 'claude-3',
        system: expect.any(String) // System prompt is separate in Anthropic
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test'
        })
      })
    );
  });

  test('should call Ollama API correctly', async () => {
    configHelper.getConfig.mockReturnValue({
      aiProvider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3'
    });

    axios.post.mockResolvedValue({
      data: {
        message: { content: 'feat: ollama commit' }
      }
    });

    const message = await generateCommitMessage(mockDiff, mockFiles);

    expect(message).toBe('feat: ollama commit');
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({
        model: 'llama3',
        stream: false
      }),
      expect.any(Object)
    );
  });

  test('should handle API errors gracefully', async () => {
    configHelper.getConfig.mockReturnValue({ aiProvider: 'openai' });
    
    axios.post.mockRejectedValue({
      response: { status: 401, data: { error: 'Unauthorized' } }
    });

    await expect(generateCommitMessage(mockDiff, mockFiles))
      .rejects.toThrow('AI Provider Error (openai): 401');
  });
});
