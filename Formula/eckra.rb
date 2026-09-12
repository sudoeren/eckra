class Eckra < Formula
  desc "AI-powered Git management CLI"
  homepage "https://github.com/sudoeren/eckra"
  url "https://registry.npmjs.org/eckra/-/eckra-1.5.5.tgz"
  sha256 "78c87808d0ff49621e7f5d0f34319f28e1661586009d6035aa6cfbca0c53ce1c"
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
