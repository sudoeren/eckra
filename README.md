# Git AI - AI-Powered Git Management CLI

<div align="center">

```
   ██████╗ ██╗████████╗     █████╗ ██╗
  ██╔════╝ ██║╚══██╔══╝    ██╔══██╗██║
  ██║  ███╗██║   ██║       ███████║██║
  ██║   ██║██║   ██║       ██╔══██║██║
  ╚██████╔╝██║   ██║       ██║  ██║██║
   ╚═════╝ ╚═╝   ╚═╝       ╚═╝  ╚═╝╚═╝
```

**LM Studio entegrasyonu ile akıllı commit mesajları üreten Git yönetim aracı**

[![Node.js](https://img.shields.io/badge/Node.js-14%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

## 🚀 Özellikler

- 🤖 **AI Destekli Commit Mesajları** - LM Studio ile akıllı commit mesajları
- 📊 **Detaylı Durum Görünümü** - Git durumunu renkli ve anlaşılır şekilde gösterir
- 🌿 **Branch Yönetimi** - Branch oluştur, sil, birleştir, değiştir
- 📦 **Stash Yönetimi** - Değişiklikleri kolayca sakla ve geri al
- ⬆️ **Push/Pull İşlemleri** - Tek tuşla uzak repo senkronizasyonu
- 📜 **Commit Geçmişi** - Renkli ve filtrelenebilir commit log
- ⚙️ **Kolay Yapılandırma** - LM Studio ayarlarını kolayca yönet

## 📦 Kurulum

### Global Kurulum (Önerilen)

```bash
npm install -g git-commit-ai
```

### Yerel Kurulum

```bash
# Repoyu klonla
git clone <repo-url>
cd git-commit-ai

# Bağımlılıkları yükle
npm install

# Global olarak linkle
npm link
```

## 🎯 Kullanım

### İnteraktif Menü

```bash
# Ana menüyü başlat
gitai

# veya
gitai start
```

### Komutlar

```bash
# Durum görüntüle
gitai status

# AI destekli commit
gitai commit
gitai c

# Manuel commit mesajı ile
gitai commit -m "feat: yeni özellik eklendi"

# Push
gitai push
gitai p

# Branch yönetimi
gitai branch
gitai b

# Commit geçmişi
gitai log
gitai l
gitai log -n 20  # Son 20 commit

# Ayarlar
gitai config
```

## ⚙️ LM Studio Yapılandırması

### 1. LM Studio'yu Başlatın

1. [LM Studio](https://lmstudio.ai/)'yu indirin ve kurun
2. Bir model yükleyin (önerilen: `git-commit-message/unsloth.Q4_K_M.gguf`)
3. "Local Server" sekmesine gidin
4. Server'ı başlatın (varsayılan port: 1234)

### 2. Git AI Ayarları

```bash
# Ayarlar menüsünü aç
gitai config
```

Varsayılan ayarlar:

- **LM Studio URL:** `http://localhost:1234`
- **Model:** `git-commit-message/unsloth.Q4_K_M.gguf`

## 📖 Kullanım Senaryoları

### Senaryo 1: Hızlı AI Commit

```bash
# Değişiklik yap
echo "yeni kod" >> dosya.js

# Git AI'ı başlat
gitai

# Menüden:
# 1. ➕ Dosya Ekle (Stage) → Tüm dosyaları stage'e al
# 2. 💬 AI Commit → AI önerilerinden birini seç
# 3. ⬆️ Push → Değişiklikleri gönder
```

### Senaryo 2: Branch ile Çalışma

```bash
gitai branch

# Menüden:
# 1. ➕ Yeni branch oluştur → "feature/yeni-ozellik"
# 2. (Değişiklikler yap)
# 3. AI Commit
# 4. 🔀 Branch birleştir → main ile birleştir
```

### Senaryo 3: Stash Kullanımı

```bash
gitai

# Menüden:
# 1. 📦 Stash Yönetimi → Değişiklikleri stash'e al
# 2. (Başka işler yap)
# 3. 📦 Stash Yönetimi → Son stash'i geri al
```

## 🎨 Ekran Görüntüleri

### Ana Menü

```
───────────────────────────────────────────────────────────
📁 Branch: main | ✓ Staged: 2 | ● Modified: 1 | ? Untracked: 3 | 🤖 AI: Online
───────────────────────────────────────────────────────────

? Ne yapmak istiyorsunuz?
❯ 📊 Durum Görüntüle
  ➕ Dosya Ekle (Stage)
  ➖ Stage'den Çıkar
  ──────────────
  💬 AI Commit
  ⬆️  Push
  ⬇️  Pull
```

### AI Commit

```
📝 Stage edilmiş dosyalar:
   • src/index.js
   • README.md

✔ Commit mesajları oluşturuldu!

? Bir commit mesajı seçin veya kendi mesajınızı yazın:
❯ 1. feat: add new user authentication module
  2. feat: implement login functionality with JWT tokens
  3. feat(auth): add user authentication system
  ──────────────
  ✏️  Kendi mesajımı yazacağım
  🔄 Yeni öneriler oluştur
```

## 🔧 Sorun Giderme

### LM Studio Bağlantı Hatası

1. LM Studio'nun çalıştığından emin olun
2. Server'ın başlatıldığını kontrol edin
3. Port numarasını doğrulayın:
   ```bash
   gitai config
   # → LM Studio URL değiştir
   ```

### Git Repository Hatası

```bash
# Klasörün bir Git repo olduğundan emin olun
git init

# Veya mevcut bir repoyu klonlayın
git clone <url>
```

### Commit Başarısız

- Stage edilmiş dosya olduğundan emin olun
- Git kullanıcı bilgilerinizi ayarlayın:
  ```bash
  git config --global user.name "Adınız"
  git config --global user.email "email@example.com"
  ```

## 📁 Proje Yapısı

```
git-commit-ai/
├── src/
│   ├── index.js          # Ana CLI giriş noktası
│   ├── helpers/
│   │   ├── git.js        # Git işlemleri
│   │   ├── lmstudio.js   # LM Studio API
│   │   └── config.js     # Yapılandırma yönetimi
│   └── ui/
│       ├── menu.js       # Ana menü
│       ├── status.js     # Durum görünümü
│       ├── commit.js     # Commit işlemleri
│       ├── push.js       # Push işlemleri
│       ├── branch.js     # Branch yönetimi
│       ├── log.js        # Commit geçmişi
│       └── config.js     # Ayarlar menüsü
├── package.json
└── README.md
```

## 🤝 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`gitai commit` kullanın! 😉)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📄 Lisans

MIT License - Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## 🙏 Teşekkürler

- [LM Studio](https://lmstudio.ai/) - Yerel LLM çalıştırma
- [simple-git](https://github.com/steveukx/git-js) - Git işlemleri
- [inquirer](https://github.com/SBoudrias/Inquirer.js) - İnteraktif CLI
- [chalk](https://github.com/chalk/chalk) - Terminal renklendirme
