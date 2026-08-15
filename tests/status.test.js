const { getGitStatus } = require('../src/helpers/git');
const { getStatusInfo, statusLine } = require('../src/ui/modules/status');

jest.mock('../src/helpers/git');

describe('Status UI module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should include deleted files in status info', async () => {
    getGitStatus.mockResolvedValue({
      current: 'main',
      staged: [],
      modified: [],
      deleted: ['old-file.js'],
      not_added: [],
      conflicted: [],
    });

    const info = await getStatusInfo();

    expect(info.deleted).toBe(1);
    expect(info.clean).toBe(false);
    expect(statusLine(info)).toContain('1 deleted');
    expect(statusLine(info)).toContain('✕');
  });
});
