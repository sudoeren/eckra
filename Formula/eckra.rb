class Eckra < Formula
  desc "AI-powered Git management CLI"
  homepage "https://github.com/sudoeren/eckra"
  url "https://registry.npmjs.org/eckra/-/eckra-1.6.1.tgz"
  sha256 "4505ab3d7f4db1b5500a7d51754722ac258f020d633903540bcdce78bd58044d"
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
