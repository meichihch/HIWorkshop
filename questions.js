// ============================================================
// 題目設定（依 2026/10/25 與 May 確認的流程）
// 改題目文字：每一題的 prompt 是投影上的大字，hint 是學生手機上的說明
// type：checkin（報到名單）、survey-ai / survey-happy（問卷回顧）、
//       cloud（文字雲）、wall（便利貼牆）
// ============================================================
(function () {
  const S = window.SURVEY;
  // 選單列出第 1–6 組；投影只顯示有人選的組別
  const GROUPS = ["第 1 組", "第 2 組", "第 3 組", "第 4 組", "第 5 組", "第 6 組"];

  window.GROUPS = GROUPS;
  window.WORKSHOPS = [
    {
      id: "w1",
      title: "第一場｜同理 → 定義",
      questions: [
        {
          id: "w1-checkin", type: "checkin", title: "報到＋分組",
          prompt: "掃碼報到，選擇你的組別",
        },
        {
          id: "w1-word", type: "cloud", title: "今天的幸福",
          prompt: "用一個詞，形容你今天的幸福",
          hint: "可以送出好幾個",
          placeholder: "例如：睡飽、熱豆漿、貓",
          maxLen: 12,
          compare: { title: "10 月初問卷：幸福力是⋯⋯", words: S.happinessKeywords },
        },
        {
          id: "w1-survey-happy", type: "survey-happy", title: "問卷回顧：幸福力",
          prompt: "你們寫下的幸福力",
        },
        {
          id: "w1-imagine", type: "wall", title: "重新想像幸福力／永續",
          prompt: "我們這組對幸福力和永續的想像",
          hint: "各組討論後上傳，可以分成好幾則",
          placeholder: "我們覺得⋯⋯",
          maxLen: 300,
        },
        {
          id: "w1-empathy", type: "wall", title: "同理：個人經驗的觀察",
          prompt: "從個人經驗出發，你觀察到什麼？",
          hint: "從職場、家庭或生活經驗出發。揭曉前，大家只看得到自己送出的內容",
          placeholder: "我注意到⋯⋯",
          maxLen: 300,
          hideUntilReveal: true,
        },
        {
          id: "w1-hmw", type: "wall", title: "定義問題：HMW",
          prompt: "我們可以如何⋯⋯？",
          hint: "上傳你們組的 HMW 問句，再幫你最想解的題目按讚",
          placeholder: "我們可以如何⋯⋯",
          maxLen: 150,
          likes: "想解這題",
        },
      ],
    },
    {
      id: "w2",
      title: "第二場｜Ideate → 概念框架 → 展示",
      questions: [
        {
          id: "w2-recap", type: "wall", title: "回顧第一場：HMW",
          prompt: "上次各組的 HMW",
          source: "w1-hmw",        // 顯示第一場 HMW 的資料
          readonly: true,          // 學生不用作答
          likes: "想解這題",
        },
        {
          id: "w2-survey-ai", type: "survey-ai", title: "問卷回顧：AI 使用",
          prompt: "你們和 AI 的關係",
        },
      ],
    },
  ];

  window.ALL_QUESTIONS = window.WORKSHOPS.flatMap((w) => w.questions.map((q) => ({ ...q, workshop: w.id })));
  window.findQuestion = (id) => window.ALL_QUESTIONS.find((q) => q.id === id) || null;
  window.dataKey = (q) => (q ? q.source || q.id : null);   // 這一題的資料存在哪個題目代號
  window.CHECKIN_Q = "checkin";                             // 報到資料共用的代號（兩場通用）
})();
