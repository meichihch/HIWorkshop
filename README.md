# 幸福力互動牆：設定教學

工作坊用的即時互動網站。學生用手機掃 QR code，只要填名字就能作答（不用登入），投影畫面會即時顯示結果，也能和課前問卷的結果並排對照。

## 檔案說明

| 檔案 | 用途 |
|---|---|
| `index.html` | 學生手機端（掃 QR code 進來的頁面） |
| `host.html` | 講師投影＋控制端 |
| `questions.js` | **所有題目都在這裡**，要改題目文字、分組數量都改這個檔案 |
| `survey.js` | 課前問卷的匿名統計與原文（已移除姓名和 email） |
| `config.js` | 填入 Supabase 的網址和金鑰 |
| `setup.sql` | 建立資料庫用，只要執行一次 |
| `lib/` | 程式用到的套件，請整個資料夾一起上傳 |

---

## 第 0 步：先試玩（不用任何設定）

還沒填 `config.js` 時，網站會自動進入**示範模式**，畫面上會顯示黃色的「示範模式」標籤。

1. 解壓縮後，用 Chrome 打開 `host.html`，在密碼欄隨便輸入，按「解鎖控制」
2. 在**同一個瀏覽器**的另一個分頁打開 `index.html`，把視窗拉窄來模擬手機
3. 在學生分頁送出答案，投影分頁就會即時更新

> 示範模式的資料只存在這台電腦的瀏覽器裡，其他人的手機看不到。正式上課前，請完成下面的設定。

---

## 第 1 步：建立 Supabase 專案（約 5 分鐘）

1. 到 [supabase.com](https://supabase.com)，按 **Start your project**，可以直接用 GitHub 帳號登入
2. 按 **New project**
   - Name：`happiness-live`（隨意）
   - Database Password：按 Generate 產生，存起來就好，之後用不到
   - Region：選 **Northeast Asia (Tokyo)**，離台灣最近
3. 等 1–2 分鐘，專案建立完成

## 第 2 步：建立資料表（約 2 分鐘）

1. 用文字編輯器打開 `setup.sql`，找到這一行：
   ```sql
   insert into public.host_secret (id, pin) values (1, '1234')      -- ← 改成你的密碼
   ```
   把 `1234` 改成你自己的講師密碼（只有你知道，用來切換題目、清空資料）
2. 回到 Supabase 後台，左側選單點 **SQL Editor** → **New query**
3. 把 `setup.sql` 的全部內容貼上，按右下角 **Run**
4. 看到 `Success. No rows returned` 就完成了

> 之後想改密碼，只要改好數字、再執行一次 `setup.sql` 就好，不會刪掉已有的資料。
>
> **如果你之前已經執行過舊版的 `setup.sql`**：這一版新增了「揭曉」功能，請把新版的 `setup.sql` 再執行一次。

## 第 3 步：把金鑰填進 config.js（約 2 分鐘）

1. Supabase 後台左下角點 **Project Settings**（齒輪圖示）→ **API Keys**
   （舊版介面在 **Project Settings → API**）
2. 複製兩個值：
   - **Project URL**：長得像 `https://abcdxyz.supabase.co`（在 **Data API** 頁面或首頁的 Connect 按鈕裡）
   - **anon public key**，或新版的 **publishable key**（`sb_publishable_...` 開頭）
3. 打開 `config.js`，把它們貼到對應的位置：
   ```js
   SUPABASE_URL: "https://abcdxyz.supabase.co",
   SUPABASE_KEY: "eyJhbGciOi...",
   ```

> 這把 key 本來就是設計給網頁公開使用的，資料庫的權限已經由 `setup.sql` 鎖好。**千萬不要**貼 `service_role` 或 `secret` key。

## 第 4 步：用 GitHub Pages 上線（約 5 分鐘）

1. 到 GitHub 建立一個新的 repository，例如 `happiness-live`，設成 **Public**
2. 在 repo 頁面點 **Add file → Upload files**，把解壓縮後的**所有檔案和 `lib` 資料夾**拖進去，按 **Commit changes**
3. 到 **Settings → Pages**
   - Source：**Deploy from a branch**
   - Branch：**main**，資料夾選 **/ (root)**，按 **Save**
4. 等 1–2 分鐘，網址會出現在同一頁，例如：
   - 學生端：`https://meichihch.github.io/happiness-live/`
   - 投影端：`https://meichihch.github.io/happiness-live/host.html`

> **隱私提醒**：Public repo 代表任何人都看得到原始碼，包含 `survey.js` 裡的匿名問卷原文（沒有姓名和 email）。如果不想公開這些文字，可以在 `survey.js` 刪掉 `happinessQuotes`，只保留統計數字。

---

## 上課當天

1. 筆電接投影機，打開 `host.html`，輸入密碼按「解鎖控制」
2. 學生掃右邊的 QR code，填名字、選組別報到（第 1 題的投影會顯示各組名單）
3. 用下方控制列或鍵盤切換題目，學生手機會自動跟著換

### 控制列功能

| 按鈕 | 作用 |
|---|---|
| ◀ ▶／下拉選單 | 切換題目（鍵盤 ← → 也可以） |
| 揭曉／收起內容 | 「同理」那一題先收集、不顯示內容，按「揭曉」才一起打開 |
| 對照問卷 | 文字雲那一題，並排顯示「課前問卷關鍵詞」和「現場結果」 |
| 組別篩選 | 畫面上方的「全部／第 N 組」，只看某一組的內容 |
| 顯示姓名 | 便利貼上顯示學生名字（預設不顯示） |
| 依票數排序 | 把最多讚的便利貼排到前面 |
| 隱藏 | 滑鼠移到便利貼上，右上角會出現「隱藏」，用來處理不適當的內容 |
| 清空本題 | 按兩次確認，清掉這題的全部回覆（建議只在彩排後使用） |
| 匯出 Excel（CSV） | 下載兩場的所有資料，用 Excel 打開就是中文 |
| QR：大／小／隱藏 | 調整 QR code 的大小 |
| 簡報模式 | 隱藏控制列，滑鼠移到底部才出現（鍵盤 F 是全螢幕） |

---

## 課前檢查清單

- [ ] **前一天登入 Supabase 後台一次**。免費專案超過 7 天沒有使用會自動暫停，暫停的話後台會有 **Restore** 按鈕
- [ ] 用自己的手機，在**學校的 Wi-Fi 和 4G 各測一次**
- [ ] 彩排完後，對每一題按「清空本題」，或在 SQL Editor 執行下面這行清掉全部測試資料：
  ```sql
  truncate public.responses cascade;
  ```

## 常見調整

- **改題目**：編輯 `questions.js`，每一題的 `prompt` 是投影上的大字，`hint` 是學生手機上的說明
- **改分組數**：`questions.js` 最上面的 `GROUPS`（目前列出第 1–6 組，投影的報到名單和各組則數永遠顯示 6 組）
- **改標題**：`config.js` 的 `EVENT_TITLE`
- 改完重新上傳到 GitHub（Add file → Upload files 會直接覆蓋），大約 1 分鐘後生效
