class Eckra < Formula
  desc "AI-powered Git management CLI"
  homepage "https://github.com/sudoeren/eckra"
  url "https://registry.npmjs.org/eckra/-/eckra-1.5.6.tgz"
  sha256 "728cbe18722c02b780ffc1f2013308db9b8656c64066b48b5bf540cef5b488be"
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
