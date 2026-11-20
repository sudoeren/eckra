class Eckra < Formula
  desc "AI-powered Git management CLI"
  homepage "https://github.com/sudoeren/eckra"
  url "https://registry.npmjs.org/eckra/-/eckra-1.6.2.tgz"
  sha256 "1fecdde297714c1c97d3d1acf8ce2b10d861abda18197b8bb72853a8c5663adb"
  license "MIT"
  head "https://github.com/sudoeren/eckra.git", branch: "master"

  depends_on "node"

  livecheck do
    url "https://registry.npmjs.org/eckra/latest"
    regex(/"version"\s*:\s*"(\d+(?:\.\d+)+)"/i)
  end

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/eckra --version")
  end
end
