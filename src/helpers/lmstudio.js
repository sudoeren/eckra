const axios = require("axios");
const { getConfig } = require("./config");

/**
 * Generate commit message using LM Studio
 */
async function generateCommitMessage(diff, filesList) {
  const config = getConfig();

  const prompt = `Sen bir Git commit mesajı oluşturucususun. Aşağıdaki değişikliklere bakarak kısa, açıklayıcı ve Conventional Commits formatında bir commit mesajı oluştur.

Conventional Commits formatı:
- feat: Yeni bir özellik
- fix: Bir hata düzeltmesi
- docs: Sadece dokümantasyon değişiklikleri
- style: Kodu etkilemeyen değişiklikler (boşluk, format, noktalı virgül eksikliği vb.)
- refactor: Hata düzeltmeyen ve özellik eklemeyen kod değişikliği
- perf: Performansı artıran kod değişikliği
- test: Eksik testlerin eklenmesi veya mevcut testlerin düzeltilmesi
- chore: Build sürecine veya yardımcı araçlara yapılan değişiklikler

Değiştirilen dosyalar:
${filesList.join("\n")}

Diff:
${diff.substring(0, 3000)}

Sadece commit mesajını yaz, başka bir açıklama ekleme. Mesaj İngilizce olsun ve 72 karakteri geçmesin.`;

  try {
    const response = await axios.post(
      `${config.lmStudioUrl}/v1/chat/completions`,
      {
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates concise and meaningful Git commit messages following Conventional Commits specification.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 100,
        stream: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      let message = response.data.choices[0].message.content.trim();
      // Clean up the message
      message = message.replace(/^["']|["']$/g, "");
      message = message.split("\n")[0]; // Take only first line
      return message;
    }

    throw new Error("Invalid response from LM Studio");
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(
        `LM Studio'ya bağlanılamadı. Lütfen LM Studio'nun ${config.lmStudioUrl} adresinde çalıştığından emin olun.`,
      );
    }
    if (error.response) {
      throw new Error(
        `LM Studio hatası: ${error.response.status} - ${error.response.statusText}`,
      );
    }
    throw error;
  }
}

/**
 * Check if LM Studio is available
 */
async function checkLMStudioConnection() {
  const config = getConfig();

  try {
    const response = await axios.get(`${config.lmStudioUrl}/v1/models`, {
      timeout: 5000,
    });
    return {
      connected: true,
      models: response.data?.data || [],
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Generate multiple commit message suggestions
 */
async function generateCommitSuggestions(diff, filesList, count = 3) {
  const config = getConfig();

  const prompt = `Sen bir Git commit mesajı oluşturucususun. Aşağıdaki değişikliklere bakarak ${count} adet farklı commit mesajı öner. Her biri Conventional Commits formatında olsun.

Değiştirilen dosyalar:
${filesList.join("\n")}

Diff:
${diff.substring(0, 3000)}

${count} adet farklı commit mesajı yaz, her birini yeni satırda. Sadece mesajları yaz, numara veya açıklama ekleme.`;

  try {
    const response = await axios.post(
      `${config.lmStudioUrl}/v1/chat/completions`,
      {
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates concise and meaningful Git commit messages.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
        stream: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      let content = response.data.choices[0].message.content.trim();

      // Backtick bloklarını temizle
      content = content.replace(/```[\s\S]*?```/g, "");
      content = content.replace(/`/g, "");

      const suggestions = content
        .split("\n")
        .map((line) => {
          let cleaned = line
            .replace(/^\d+[\.\)\-\:]\s*/, "") // Numara kaldır
            .replace(/^[\-\*]\s*/, "") // Liste işareti kaldır
            .replace(/^["']|["']$/g, "") // Tırnak kaldır
            .trim();
          return cleaned;
        })
        .filter((line) => line.length > 5 && !line.startsWith("```"))
        .slice(0, count);

      // Eğer boşsa varsayılan öneriler
      if (suggestions.length === 0) {
        return [
          "chore: update files",
          "refactor: improve code",
          "feat: add changes",
        ];
      }

      return suggestions;
    }

    throw new Error("Invalid response from LM Studio");
  } catch (error) {
    if (error.code === "ECONNREFUSED") {
      throw new Error(`LM Studio'ya bağlanılamadı.`);
    }
    throw error;
  }
}

module.exports = {
  generateCommitMessage,
  checkLMStudioConnection,
  generateCommitSuggestions,
};
