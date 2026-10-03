class Eckra < Formula
  desc "AI-powered Git management CLI"
  homepage "https://github.com/sudoeren/eckra"
  url "https://registry.npmjs.org/eckra/-/eckra-1.6.0.tgz"
  sha256 "0b607730096517035efbe4cfbfc5e2924262494e334a87193147faf43a4f7799"
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
