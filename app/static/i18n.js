// ── i18n ─────────────────────────────────────────────────────────────
const I18N = {
  nav_applications: { en: "📋 My Applications", uz: "📋 Arizalarim", ru: "📋 Мои заявки" },
  greeting: { en: "Hi {name}", uz: "Salom, {name}", ru: "Привет, {name}" },
  open_from_bot: {
    en: "Open this from the Telegram bot, not a regular browser.",
    uz: "Buni oddiy brauzerda emas, Telegram bot orqali oching.",
    ru: "Откройте это через Telegram-бота, а не в обычном браузере.",
  },
  cv_gate_hint: {
    en: "Upload your CV so I can search and score vacancies against it.",
    uz: "Vakansiyalarni qidirish va CV'ingizni ular bilan solishtirish uchun CV yuklang.",
    ru: "Загрузите резюме, чтобы я мог искать вакансии и сравнивать их с вашим резюме.",
  },
  cv_file_label: { en: "CV (PDF or DOCX)", uz: "CV (PDF yoki DOCX)", ru: "Резюме (PDF или DOCX)" },
  upload_cv_btn: { en: "📄 Upload CV", uz: "📄 CV yuklash", ru: "📄 Загрузить резюме" },
  title_screen_hint: {
    en: "What position are you looking for?", uz: "Qanday lavozimni qidiryapsiz?", ru: "Какую должность вы ищете?",
  },
  type_own: { en: "✍️ Type my own", uz: "✍️ O'zim kiritaman", ru: "✍️ Введу сам" },
  suggest_from_cv: { en: "🤖 Suggest from my CV", uz: "🤖 CV'imdan taklif qiling", ru: "🤖 Предложить по резюме" },
  job_title_label: { en: "Job title", uz: "Lavozim nomi", ru: "Название должности" },
  job_title_placeholder: { en: "e.g. Data Analyst", uz: "masalan: Data Analyst", ru: "например: Data Analyst" },
  next_btn: { en: "Next →", uz: "Keyingi →", ru: "Далее →" },
  suggest_different: {
    en: "🔄 Suggest different titles", uz: "🔄 Boshqa lavozimlarni taklif qilish", ru: "🔄 Предложить другие варианты",
  },
  searching_for_prefix: { en: "Searching for", uz: "Qidirilmoqda:", ru: "Ищу:" },
  change_link: { en: "← change", uz: "← o'zgartirish", ru: "← изменить" },
  location_label: { en: "Location", uz: "Joylashuv", ru: "Локация" },
  location_placeholder: {
    en: "e.g. Tashkent, Remote, Europe", uz: "masalan: Toshkent, Remote, Yevropa", ru: "например: Ташкент, Remote, Европа",
  },
  search_btn: { en: "🔍 Search", uz: "🔍 Qidirish", ru: "🔍 Искать" },
  applications_title: {
    en: "Your tracked applications", uz: "Kuzatilayotgan arizalaringiz", ru: "Ваши отслеживаемые заявки",
  },
  back_link: { en: "← back", uz: "← orqaga", ru: "← назад" },
  couldnt_load_profile: {
    en: "Couldn't load your profile.", uz: "Profilingizni yuklab bo'lmadi.", ru: "Не удалось загрузить ваш профиль.",
  },
  retry_btn: { en: "Try again", uz: "Qayta urinish", ru: "Повторить" },
  choose_file_first: {
    en: "Choose a PDF or DOCX file first.", uz: "Avval PDF yoki DOCX faylni tanlang.", ru: "Сначала выберите файл PDF или DOCX.",
  },
  reading_cv: { en: "📄 Reading your CV…", uz: "📄 CV'ingiz o'qilmoqda…", ru: "📄 Читаю ваше резюме…" },
  upload_failed: {
    en: "Upload failed, try again.", uz: "Yuklash amalga oshmadi, qaytadan urinib ko'ring.", ru: "Загрузка не удалась, попробуйте снова.",
  },
  analyzing_cv: { en: "🤖 Analyzing your CV…", uz: "🤖 CV'ingiz tahlil qilinmoqda…", ru: "🤖 Анализирую ваше резюме…" },
  suggestions_failed: {
    en: "Couldn't get suggestions, try again.", uz: "Takliflarni olib bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось получить варианты, попробуйте снова.",
  },
  enter_title_first: {
    en: "Enter a job title first.", uz: "Avval lavozim nomini kiriting.", ru: "Сначала введите название должности.",
  },
  status_applied: { en: "Applied", uz: "Yuborilgan", ru: "Подана" },
  status_phone_screen: { en: "Phone screen", uz: "Telefon suhbati", ru: "Телефонное интервью" },
  status_tech_interview: { en: "Tech interview", uz: "Texnik intervyu", ru: "Техническое интервью" },
  status_offer: { en: "Offer 🎉", uz: "Taklif 🎉", ru: "Оффер 🎉" },
  status_rejected: { en: "Rejected", uz: "Rad etilgan", ru: "Отказ" },
  status_ghosted: { en: "Ghosted", uz: "Javob kelmadi", ru: "Без ответа" },
  applications_load_failed: {
    en: "Couldn't load your applications.", uz: "Arizalaringizni yuklab bo'lmadi.", ru: "Не удалось загрузить ваши заявки.",
  },
  no_applications: {
    en: "Nothing tracked yet — like a vacancy and apply to see it here.",
    uz: "Hali hech narsa yo'q — vakansiyani yoqtiring va ariza bering, shunda u shu yerda ko'rinadi.",
    ru: "Пока пусто — отметьте вакансию как понравившуюся и подайте заявку, чтобы увидеть её здесь.",
  },
  no_applications_match_filter: {
    en: "No applications match this filter.", uz: "Bu filtrga mos ariza yo'q.", ru: "Нет заявок, соответствующих фильтру.",
  },
  filter_all: { en: "All statuses", uz: "Barcha holatlar", ru: "Все статусы" },
  sort_date: { en: "Newest first", uz: "Avval yangilari", ru: "Сначала новые" },
  sort_score: { en: "Highest match first", uz: "Avval eng mosi", ru: "Сначала с высоким совпадением" },
  status_label_prefix: { en: "Status:", uz: "Holat:", ru: "Статус:" },
  match_suffix: { en: "% match", uz: "% moslik", ru: "% совпадение" },
  view_posting: { en: "View posting →", uz: "E'lonni ko'rish →", ru: "Посмотреть вакансию →" },
  search_limit_session: {
    en: "You've used your 3 free searches for this job title.",
    uz: "Ushbu lavozim uchun 3 ta bepul qidiruvingizdan foydalandingiz.",
    ru: "Вы использовали 3 бесплатных поиска для этой должности.",
  },
  searching_message: {
    en: "🔎 Searching for {title} in {location}… usually takes 15–30 seconds.",
    uz: "🔎 {title} bo'yicha {location} joyida qidirilmoqda… odatda 15–30 soniya vaqt oladi.",
    ru: "🔎 Ищу «{title}» в {location}… обычно занимает 15–30 секунд.",
  },
  search_failed: {
    en: "Search failed on our end. Please try again in a moment.",
    uz: "Qidiruv bizning tomonda amalga oshmadi. Birozdan keyin qayta urinib ko'ring.",
    ru: "Поиск не удался на нашей стороне. Попробуйте ещё раз через некоторое время.",
  },
  no_match_found: {
    en: "No matching posting found — try different criteria.",
    uz: "Mos e'lon topilmadi — boshqa mezonlar bilan urinib ko'ring.",
    ru: "Подходящая вакансия не найдена — попробуйте другие критерии.",
  },
  no_more_new_matches: {
    en: "No new postings found this time — here's what you already had.",
    uz: "Bu safar yangi e'lon topilmadi — avval topilganlar shu yerda.",
    ru: "На этот раз новых вакансий не найдено — вот то, что уже было найдено.",
  },
  like_this_one: { en: "Like this one?", uz: "Shu yoqdimi?", ru: "Нравится эта вакансия?" },
  yes_like_it: { en: "👍 Yes, I like it", uz: "👍 Ha, yoqdi", ru: "👍 Да, нравится" },
  search_again_btn: { en: "🔄 Search again", uz: "🔄 Qayta qidirish", ru: "🔄 Искать снова" },
  search_limit_title: {
    en: "You've used your 3 free searches for this job title.",
    uz: "Ushbu lavozim uchun 3 ta bepul qidiruvingizdan foydalandingiz.",
    ru: "Вы использовали 3 бесплатных поиска для этой должности.",
  },
  search_cap_prompt: {
    en: "Try a different job title for fresh results, get daily alerts instead of searching manually, or go deeper with a full CV-vs-job analysis.",
    uz: "Yangi natijalar uchun boshqa lavozim nomini sinab ko'ring, qo'lda qidirish o'rniga kunlik bildirishnomalarni yoqing, yoki CV'ingizni to'liq tahlil qiling.",
    ru: "Попробуйте другую должность для новых результатов, включите ежедневные уведомления вместо ручного поиска, либо сделайте полный анализ резюме и вакансии.",
  },
  search_cap_new_title_btn: {
    en: "🔎 Try a different title", uz: "🔎 Boshqa lavozimni sinash", ru: "🔎 Попробовать другую должность",
  },
  search_cap_alerts_btn: {
    en: "🔔 Get daily alerts instead", uz: "🔔 Kunlik bildirishnomalarni yoqish", ru: "🔔 Включить ежедневные уведомления",
  },
  search_cap_analyze_btn: {
    en: "📊 Analyze my CV against a job", uz: "📊 CV'imni ish e'loniga solishtirish", ru: "📊 Сравнить резюме с вакансией",
  },
  carousel_prev: { en: "← Previous", uz: "← Oldingi", ru: "← Предыдущая" },
  carousel_next: { en: "Next →", uz: "Keyingi →", ru: "Следующая →" },
  how_proceed: { en: "How do you want to proceed?", uz: "Qanday davom etishni xohlaysiz?", ru: "Как хотите продолжить?" },
  apply_directly: { en: "✅ Apply directly", uz: "✅ To'g'ridan-to'g'ri ariza berish", ru: "✅ Подать заявку сразу" },
  check_cv_fit: { en: "📊 Check my CV fit", uz: "📊 CV moslikni tekshirish", ru: "📊 Проверить соответствие резюме" },
  saving: { en: "Saving…", uz: "Saqlanmoqda…", ru: "Сохраняю…" },
  apply_failed: {
    en: "Couldn't save your application, try again.", uz: "Arizangizni saqlab bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось сохранить заявку, попробуйте снова.",
  },
  checking_fit: {
    en: "📊 Comparing your CV to this vacancy…", uz: "📊 CV'ingiz ushbu vakansiya bilan solishtirilmoqda…", ru: "📊 Сравниваю ваше резюме с этой вакансией…",
  },
  scoring_failed: {
    en: "Couldn't score your CV, try again.", uz: "CV'ingizni baholab bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось оценить резюме, попробуйте снова.",
  },
  match_heading: { en: "{score}% Match", uz: "{score}% Moslik", ru: "{score}% Соответствие" },
  matched_label: { en: "Matched:", uz: "Mos keldi:", ru: "Совпало:" },
  missing_label: { en: "Missing:", uz: "Yetishmayapti:", ru: "Отсутствует:" },
  apply_anyway: { en: "✅ Apply anyway", uz: "✅ Baribir ariza berish", ru: "✅ Подать заявку в любом случае" },
  get_recommendations: { en: "📝 Get recommendations", uz: "📝 Tavsiyalar olish", ru: "📝 Получить рекомендации" },
  level_question: {
    en: "What's your level for this role?", uz: "Ushbu lavozim uchun darajangiz qanday?", ru: "Какой у вас уровень для этой роли?",
  },
  working_out_fixes: {
    en: "📝 Working out what to fix…", uz: "📝 Nimani tuzatish kerakligi aniqlanmoqda…", ru: "📝 Определяю, что нужно исправить…",
  },
  recommendations_failed: {
    en: "Couldn't get recommendations, try again.", uz: "Tavsiyalarni olib bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось получить рекомендации, попробуйте снова.",
  },
  issue_label: { en: "Issue:", uz: "Muammo:", ru: "Проблема:" },
  before_label: { en: "Before:", uz: "Oldin:", ru: "До:" },
  after_label: { en: "After:", uz: "Keyin:", ru: "После:" },
  ready_to_apply: {
    en: "Ready to apply, or want to improve your CV first?",
    uz: "Ariza berishga tayyormisiz, yoki avval CV'ingizni yaxshilamoqchimisiz?",
    ru: "Готовы подать заявку, или сначала хотите улучшить резюме?",
  },
  apply_now: { en: "✅ Apply now", uz: "✅ Hozir ariza berish", ru: "✅ Подать заявку сейчас" },
  improve_cv_btn: { en: "📄 Improve CV", uz: "📄 CV'ni yaxshilash", ru: "📄 Улучшить резюме" },
  upload_updated_cv: {
    en: "Upload your updated CV (PDF or DOCX).", uz: "Yangilangan CV'ingizni yuklang (PDF yoki DOCX).", ru: "Загрузите обновлённое резюме (PDF или DOCX).",
  },
  upload_improved_btn: {
    en: "📄 Upload improved CV", uz: "📄 Yaxshilangan CV'ni yuklash", ru: "📄 Загрузить улучшенное резюме",
  },
  reading_updated_cv: {
    en: "📄 Reading your updated CV…", uz: "📄 Yangilangan CV'ingiz o'qilmoqda…", ru: "📄 Читаю обновлённое резюме…",
  },
  improve_limit_reached: {
    en: "CV updated. You've reached the improve limit for this vacancy — ready to apply.",
    uz: "CV yangilandi. Ushbu vakansiya uchun yaxshilash chegarasiga yetdingiz — ariza berishga tayyor.",
    ru: "Резюме обновлено. Вы достигли лимита улучшений для этой вакансии — можно подавать заявку.",
  },
  improve_choice: {
    en: "CV updated. Apply now, or check your new match % first?",
    uz: "CV yangilandi. Hozir ariza berasizmi, yoki avval yangi moslik foizini tekshirasizmi?",
    ru: "Резюме обновлено. Подать заявку сейчас или сначала проверить новый процент соответствия?",
  },
  check_match_again: { en: "📊 Check match again", uz: "📊 Moslikni qayta tekshirish", ru: "📊 Проверить соответствие снова" },
  saved_confirmation: {
    en: "✅ Saved to your tracked applications.", uz: "✅ Kuzatilayotgan arizalaringizga saqlandi.", ru: "✅ Сохранено в отслеживаемых заявках.",
  },
  view_my_applications: { en: "📋 View my applications", uz: "📋 Arizalarimni ko'rish", ru: "📋 Посмотреть мои заявки" },
  update_status_prompt: { en: "Update status:", uz: "Holatni yangilash:", ru: "Обновить статус:" },
  delete_application_btn: { en: "🗑 Delete application", uz: "🗑 Arizani o'chirish", ru: "🗑 Удалить заявку" },
  status_updated: { en: "✅ Status updated.", uz: "✅ Holat yangilandi.", ru: "✅ Статус обновлён." },
  status_update_failed: {
    en: "Couldn't update status, try again.", uz: "Holatni yangilab bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось обновить статус, попробуйте снова.",
  },
  delete_confirm: {
    en: "Delete this application? This can't be undone.",
    uz: "Ushbu arizani o'chirasizmi? Buni qaytarib bo'lmaydi.",
    ru: "Удалить эту заявку? Это действие нельзя отменить.",
  },
  delete_confirm_yes: { en: "Yes, delete", uz: "Ha, o'chirish", ru: "Да, удалить" },
  delete_confirm_no: { en: "Cancel", uz: "Bekor qilish", ru: "Отмена" },
  delete_failed: {
    en: "Couldn't delete, try again.", uz: "O'chirib bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось удалить, попробуйте снова.",
  },
  err_timeout: {
    en: "That took too long and timed out — please try again.",
    uz: "Bu juda uzoq davom etdi va vaqt tugadi — qaytadan urinib ko'ring.",
    ru: "Это заняло слишком много времени — попробуйте снова.",
  },
  err_network: {
    en: "Couldn't connect — check your internet connection and try again.",
    uz: "Ulanib bo'lmadi — internet aloqangizni tekshiring va qaytadan urinib ko'ring.",
    ru: "Не удалось подключиться — проверьте интернет-соединение и попробуйте снова.",
  },
  err_session_expired: {
    en: "Your session expired — close this and reopen it from the bot.",
    uz: "Sessiya muddati tugadi — buni yoping va botdan qaytadan oching.",
    ru: "Сессия истекла — закройте это и откройте заново через бота.",
  },
  err_generic: {
    en: "Something went wrong. Please try again.", uz: "Nimadir xato ketdi. Qaytadan urinib ko'ring.", ru: "Что-то пошло не так. Попробуйте снова.",
  },
  home_hint: {
    en: "Please choose an option:", uz: "Kerakli bo'limni tanlang:", ru: "Пожалуйста, выберите один из вариантов:",
  },
  home_analyze_option: {
    en: "📊 Analyze my CV against a job", uz: "📊 CV'imni ish e'loniga solishtirish", ru: "📊 Сравнить резюме с вакансией",
  },
  home_analyze_hint: {
    en: "Get an ATS score, bullet-point fixes, and a step-by-step roadmap.",
    uz: "ATS bali, tuzatishlar va bosqichma-bosqich reja oling.",
    ru: "Получите ATS-балл, исправления и пошаговый план.",
  },
  home_vacancy_option: {
    en: "🔍 Find & track vacancies", uz: "🔍 Vakansiya topish va kuzatish", ru: "🔍 Найти и отслеживать вакансии",
  },
  home_vacancy_hint: {
    en: "Search live postings and keep track of where you've applied.",
    uz: "Joriy e'lonlarni qidiring va qayerga ariza berganingizni kuzating.",
    ru: "Ищите актуальные вакансии и отслеживайте, куда вы откликнулись.",
  },
  analysis_title: {
    en: "CV vs Job Analysis", uz: "CV va ish e'loni tahlili", ru: "Анализ резюме и вакансии",
  },
  jd_label: {
    en: "Paste the job description, or a link to it", uz: "Ish e'loni matnini yoki havolasini joylashtiring", ru: "Вставьте текст вакансии или ссылку на неё",
  },
  jd_placeholder: {
    en: "Paste the full job posting text, or a link to it…",
    uz: "To'liq ish e'loni matnini yoki havolasini shu yerga joylashtiring…",
    ru: "Вставьте сюда полный текст вакансии или ссылку на неё…",
  },
  analyze_btn: { en: "🤖 Analyze", uz: "🤖 Tahlil qilish", ru: "🤖 Анализировать" },
  jd_too_short_web: {
    en: "Paste a fuller job description (at least 100 characters), or a link to the posting.",
    uz: "To'liqroq ish e'loni matnini (kamida 100 belgi) yoki e'lon havolasini joylashtiring.",
    ru: "Вставьте более полный текст вакансии (не менее 100 символов) или ссылку на вакансию.",
  },
  analyzing_message_web: {
    en: "🤖 Analyzing your CV against this job… usually takes 15–30 seconds.",
    uz: "🤖 CV'ingiz ushbu ish e'loni bilan tahlil qilinmoqda… odatda 15–30 soniya vaqt oladi.",
    ru: "🤖 Анализирую ваше резюме по этой вакансии… обычно занимает 15–30 секунд.",
  },
  analyzing_link_message_web: {
    en: "🔗 Reading the job posting from your link, then analyzing… usually takes 15–30 seconds.",
    uz: "🔗 Havoladagi ish e'loni o'qilmoqda, so'ng tahlil qilinadi… odatda 15–30 soniya vaqt oladi.",
    ru: "🔗 Читаю вакансию по вашей ссылке, затем анализирую… обычно занимает 15–30 секунд.",
  },
  analysis_failed_web: {
    en: "Analysis failed on our end. Please try again in a moment.",
    uz: "Tahlil bizning tomonda amalga oshmadi. Birozdan keyin qayta urinib ko'ring.",
    ru: "Анализ не удался на нашей стороне. Попробуйте ещё раз через некоторое время.",
  },
  ats_heading: { en: "ATS Score", uz: "ATS Bali", ru: "ATS-балл" },
  xyz_heading: { en: "Bullet Point Check", uz: "Band tekshiruvi", ru: "Проверка формулировок" },
  xyz_passing_label: { en: "✅ Passing:", uz: "✅ O'tgan:", ru: "✅ Хорошо:" },
  xyz_failing_label: { en: "❌ Needs work:", uz: "❌ Yaxshilash kerak:", ru: "❌ Нужна доработка:" },
  xyz_rewrites_label: { en: "Suggested rewrites:", uz: "Tavsiya etilgan tahrirlar:", ru: "Предлагаемые правки:" },
  tools_heading: { en: "Tool Radar", uz: "Vositalar radari", ru: "Радар инструментов" },
  tool_strong: { en: "Strong", uz: "Kuchli", ru: "Сильно" },
  tool_mentioned: { en: "Mentioned", uz: "Tilga olingan", ru: "Упомянуто" },
  tool_not_found: { en: "Not found", uz: "Topilmadi", ru: "Не найдено" },
  level_heading: { en: "Your Level", uz: "Sizning darajangiz", ru: "Ваш уровень" },
  get_roadmap_btn: { en: "🗺 Get My Roadmap", uz: "🗺 Rejamni olish", ru: "🗺 Получить план" },
  roadmap_continue_btn: { en: "Continue →", uz: "Davom etish →", ru: "Продолжить →" },
  roadmap_failed_web: {
    en: "Couldn't build this section, try again.", uz: "Bu bo'limni tayyorlab bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось подготовить этот раздел, попробуйте снова.",
  },
  roadmap_done: {
    en: "✅ That's the end of your roadmap. Good luck!", uz: "✅ Rejangiz shu bilan tugaydi. Omad tilaymiz!", ru: "✅ На этом ваш план завершён. Удачи!",
  },
  analysis_limit_reached: {
    en: "🚦 You've used all your free checks.", uz: "🚦 Siz barcha bepul tekshiruvlaringizdan foydalandingiz.", ru: "🚦 Вы использовали все бесплатные проверки.",
  },
  buy_checks_intro: {
    en: "Buy more — {price} UZS per check. Choose how many:",
    uz: "Ko'proq sotib oling — har biri {price} so'm. Nechtasini xohlaysiz?",
    ru: "Купите ещё — по {price} сум за проверку. Выберите количество:",
  },
  buy_custom_btn: { en: "🔢 Custom amount", uz: "🔢 Boshqa miqdor", ru: "🔢 Другое количество" },
  buy_custom_prompt: {
    en: "How many checks? Enter a number from 1 to 100.",
    uz: "Nechta tekshiruv? 1 dan 100 gacha son kiriting.",
    ru: "Сколько проверок? Введите число от 1 до 100.",
  },
  buy_custom_confirm: { en: "Confirm", uz: "Tasdiqlash", ru: "Подтвердить" },
  buy_custom_invalid: {
    en: "Enter a whole number from 1 to 100.", uz: "1 dan 100 gacha butun son kiriting.", ru: "Введите целое число от 1 до 100.",
  },
  buy_custom_total: {
    en: "Total: {amount} UZS", uz: "Jami: {amount} so'm", ru: "Итого: {amount} сум",
  },
  checkout_opening: { en: "Opening checkout…", uz: "To'lov ochilmoqda…", ru: "Открываю оплату…" },
  checkout_failed: {
    en: "Couldn't start checkout, try again.", uz: "To'lovni boshlab bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось начать оплату, попробуйте снова.",
  },
  checkout_reassurance: {
    en: "You'll finish payment on Payme's secure page, then come right back here.",
    uz: "To'lovni Payme'ning xavfsiz sahifasida yakunlaysiz, so'ng shu yerga qaytasiz.",
    ru: "Вы завершите оплату на защищённой странице Payme, а затем вернётесь сюда.",
  },
  checkout_check_status_btn: {
    en: "I've paid — check status", uz: "To'ladim — holatni tekshirish", ru: "Я оплатил — проверить статус",
  },
  checkout_confirmed: {
    en: "✅ Payment received! You now have {remaining} checks.",
    uz: "✅ To'lov qabul qilindi! Endi sizda {remaining} ta tekshiruv bor.",
    ru: "✅ Оплата получена! Теперь у вас {remaining} проверок.",
  },
  checkout_still_pending: {
    en: "Not confirmed yet - if you just paid, give it a moment and check again.",
    uz: "Hali tasdiqlanmadi - agar hozir to'lagan bo'lsangiz, biroz kuting va qayta tekshiring.",
    ru: "Пока не подтверждено - если вы только что оплатили, подождите немного и проверьте снова.",
  },
  checkout_status_check_failed: {
    en: "Couldn't check payment status, try again.", uz: "To'lov holatini tekshirib bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось проверить статус оплаты, попробуйте снова.",
  },
  checks_word_one: { en: "check", uz: "ta tekshiruv", ru: "проверка" },
  checks_word_few: { en: "checks", uz: "ta tekshiruv", ru: "проверки" },
  checks_word_many: { en: "checks", uz: "ta tekshiruv", ru: "проверок" },
  free_checks_left_one: {
    en: "You have {remaining} free check left.",
    uz: "Sizda {remaining} ta bepul tekshiruv qoldi.",
    ru: "У вас осталась {remaining} бесплатная проверка.",
  },
  free_checks_left_few: {
    en: "You have {remaining} free checks left.",
    uz: "Sizda {remaining} ta bepul tekshiruv qoldi.",
    ru: "У вас осталось {remaining} бесплатные проверки.",
  },
  free_checks_left_many: {
    en: "You have {remaining} free checks left.",
    uz: "Sizda {remaining} ta bepul tekshiruv qoldi.",
    ru: "У вас осталось {remaining} бесплатных проверок.",
  },
  welcome_body: {
    en: "👋 Welcome to AcceptedAI. I help you get accepted into your dream job — analyze your CV against a job description, or find and track vacancies.",
    uz: "👋 AcceptedAI'ga xush kelibsiz. Men sizga orzuingizdagi ishga qabul qilinishda yordam beraman — CV'ingizni ish e'loniga solishtiring yoki vakansiyalarni toping va kuzating.",
    ru: "👋 Добро пожаловать в AcceptedAI. Я помогу вам получить работу мечты — сравните резюме с вакансией или найдите и отслеживайте вакансии.",
  },
  welcome_free_checks_line: {
    en: "You get {quota} free CV-vs-job analyses to try it out.",
    uz: "Sinab ko'rish uchun {quota} ta bepul CV-ish e'loni tahlili beriladi.",
    ru: "Вам доступно {quota} бесплатных анализа резюме против вакансии, чтобы попробовать.",
  },
  welcome_continue_btn: { en: "Get started →", uz: "Boshlash →", ru: "Начать →" },
  profile_title: { en: "Profile", uz: "Profil", ru: "Профиль" },
  profile_buy_more_btn: { en: "💳 Buy more checks", uz: "💳 Ko'proq tekshiruv sotib olish", ru: "💳 Купить ещё проверок" },
  profile_my_cvs_btn: { en: "📄 My CVs", uz: "📄 Mening CV'larim", ru: "📄 Мои резюме" },
  profile_applications_btn: { en: "📋 My Applications", uz: "📋 Arizalarim", ru: "📋 Мои заявки" },
  profile_my_checks_btn: { en: "📊 My Checks", uz: "📊 Mening tekshiruvlarim", ru: "📊 Мои проверки" },
  profile_vacancy_alerts_btn: { en: "🔔 Vacancy Alerts", uz: "🔔 Vakansiya bildirishnomalari", ru: "🔔 Уведомления о вакансиях" },
  vacancy_alerts_explainer: {
    en: "Set a job title (and optional location) and we'll message you here once a day if a genuinely new matching vacancy shows up - no repeats.",
    uz: "Lavozim nomini (va xohlasangiz joylashuvni) kiriting - agar chinakam yangi mos vakansiya paydo bo'lsa, kuniga bir marta shu yerda xabar beramiz - takrorlanmaydi.",
    ru: "Укажите должность (и, при желании, локацию) - если появится действительно новая подходящая вакансия, мы напишем вам сюда раз в день, без повторов.",
  },
  vacancy_alerts_title_label: { en: "Job title", uz: "Lavozim nomi", ru: "Должность" },
  vacancy_alerts_title_placeholder: { en: "e.g. Data Analyst", uz: "masalan, Data Analyst", ru: "например, Data Analyst" },
  vacancy_alerts_location_label: { en: "Location (optional)", uz: "Joylashuv (ixtiyoriy)", ru: "Локация (необязательно)" },
  vacancy_alerts_location_placeholder: { en: "e.g. Tashkent, or leave blank for Any", uz: "masalan, Toshkent, yoki bo'sh qoldiring", ru: "например, Ташкент, или оставьте пустым" },
  vacancy_alerts_toggle_label: { en: "🔔 Notify me about new matches", uz: "🔔 Yangi mos vakansiyalar haqida xabar bering", ru: "🔔 Уведомлять о новых подходящих вакансиях" },
  vacancy_alerts_save_btn: { en: "Save", uz: "Saqlash", ru: "Сохранить" },
  vacancy_alerts_load_failed: {
    en: "Couldn't load your alert settings.", uz: "Bildirishnoma sozlamalarini yuklab bo'lmadi.", ru: "Не удалось загрузить настройки уведомлений.",
  },
  vacancy_alerts_save_failed: {
    en: "Couldn't save, try again.", uz: "Saqlab bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось сохранить, попробуйте снова.",
  },
  vacancy_alerts_needs_title: {
    en: "Set a job title before turning on alerts.", uz: "Bildirishnomalarni yoqishdan oldin lavozim nomini kiriting.", ru: "Прежде чем включить уведомления, укажите должность.",
  },
  vacancy_alerts_where_suffix: { en: " in {location}", uz: " ({location})", ru: " в {location}" },
  vacancy_alerts_saved_on: {
    en: 'Saved. We\'ll message you here about new "{job_title}" vacancies{where} - about once a day, around 09:00 (Tashkent time).',
    uz: 'Saqlandi. Yangi "{job_title}" vakansiyalari{where} haqida sizga shu yerda xabar beramiz - kuniga taxminan bir marta, soat 09:00 atrofida (Toshkent vaqti).',
    ru: 'Сохранено. Мы напишем вам сюда о новых вакансиях "{job_title}"{where} - примерно раз в день, около 09:00 (по ташкентскому времени).',
  },
  vacancy_alerts_saved_off: {
    en: 'Saved. Alerts are currently off for "{job_title}" - turn on the toggle above if you want to be notified.',
    uz: '"{job_title}" uchun bildirishnomalar hozircha o\'chiq - xabar olishni istasangiz, yuqoridagi tugmachani yoqing.',
    ru: 'Сохранено. Уведомления для "{job_title}" сейчас выключены - включите переключатель выше, если хотите получать уведомления.',
  },
  tab_home_label: { en: "Home", uz: "Bosh sahifa", ru: "Главная" },
  tab_search_label: { en: "Search", uz: "Qidirish", ru: "Поиск" },
  tab_analyze_label: { en: "Analyze", uz: "Tahlil", ru: "Анализ" },
  tab_profile_label: { en: "Profile", uz: "Profil", ru: "Профиль" },
  checks_title: { en: "Checks", uz: "Tekshiruvlar", ru: "Проверки" },
  my_checks_empty: {
    en: "You haven't checked a CV yet. To see an analysis here, first analyze your CV against a job:",
    uz: "Siz hali CV tekshiruvidan o'tmagansiz. Tahlilni shu yerda ko'rish uchun avval CV'ingizni ish e'loniga solishtiring:",
    ru: "Вы ещё не проверяли резюме. Чтобы увидеть анализ здесь, сначала сравните резюме с вакансией:",
  },
  my_checks_load_failed: {
    en: "Couldn't load your checks.", uz: "Tekshiruvlaringizni yuklab bo'lmadi.", ru: "Не удалось загрузить ваши проверки.",
  },
  my_cvs_title: { en: "My CVs", uz: "Mening CV'larim", ru: "Мои резюме" },
  my_cvs_empty: {
    en: "No CVs saved yet — upload one below.", uz: "Hali CV saqlanmagan — quyida yuklang.", ru: "Резюме ещё не сохранено — загрузите ниже.",
  },
  my_cvs_active_badge: { en: "Active", uz: "Faol", ru: "Активно" },
  my_cvs_position_label: { en: "Position:", uz: "Lavozim:", ru: "Должность:" },
  my_cvs_set_active_btn: { en: "Use this CV", uz: "Shu CV'dan foydalanish", ru: "Использовать это резюме" },
  my_cvs_load_failed: {
    en: "Couldn't load your CVs.", uz: "CV'laringizni yuklab bo'lmadi.", ru: "Не удалось загрузить ваши резюме.",
  },
  my_cvs_activate_failed: {
    en: "Couldn't switch CVs, try again.", uz: "CV'ni almashtirib bo'lmadi, qaytadan urinib ko'ring.", ru: "Не удалось переключить резюме, попробуйте снова.",
  },
  my_cvs_upload_label: {
    en: "Upload a new CV", uz: "Yangi CV yuklang", ru: "Загрузите новое резюме",
  },
  post_roadmap_no_checks: {
    en: "You're out of free checks. Buy more to analyze another job:",
    uz: "Bepul tekshiruvlaringiz tugadi. Boshqa ish e'lonini tahlil qilish uchun ko'proq sotib oling:",
    ru: "У вас закончились бесплатные проверки. Купите ещё, чтобы проанализировать другую вакансию:",
  },
  analyze_another_btn: {
    en: "📊 Analyze another job", uz: "📊 Boshqa ish e'lonini tahlil qilish", ru: "📊 Проанализировать другую вакансию",
  },
};

let currentLang = "en";

function t(key, vars) {
  const entry = I18N[key];
  let text = (entry && (entry[currentLang] || entry.en)) || key;
  if (vars) {
    for (const k in vars) text = text.replace(`{${k}}`, vars[k]);
  }
  return text;
}

function applyStaticTranslations() {
  document.getElementById("cv-gate-hint").textContent = t("cv_gate_hint");
  document.getElementById("cv-file-label").textContent = t("cv_file_label");
  document.getElementById("upload_btn").textContent = t("upload_cv_btn");
  document.getElementById("home-hint").textContent = t("home_hint");
  document.getElementById("home-analyze-option").textContent = t("home_analyze_option");
  document.getElementById("home-analyze-hint").textContent = t("home_analyze_hint");
  document.getElementById("home-vacancy-option").textContent = t("home_vacancy_option");
  document.getElementById("home-vacancy-hint").textContent = t("home_vacancy_hint");
  document.getElementById("analysis-title").textContent = t("analysis_title");
  document.getElementById("jd-label").textContent = t("jd_label");
  document.getElementById("jd_text").placeholder = t("jd_placeholder");
  document.getElementById("analyze_btn").textContent = t("analyze_btn");
  document.getElementById("title-screen-hint").textContent = t("title_screen_hint");
  document.getElementById("btn-type-own").textContent = t("type_own");
  document.getElementById("btn-suggest-cv").textContent = t("suggest_from_cv");
  document.getElementById("manual-title-label").textContent = t("job_title_label");
  document.getElementById("manual_title").placeholder = t("job_title_placeholder");
  document.getElementById("btn-next-title").textContent = t("next_btn");
  document.getElementById("btn-suggest-again").textContent = t("suggest_different");
  document.getElementById("searching-for-label").firstChild.textContent = t("searching_for_prefix") + " ";
  document.getElementById("btn-change-title").textContent = t("change_link");
  document.getElementById("location-label").textContent = t("location_label");
  document.getElementById("location").placeholder = t("location_placeholder");
  document.getElementById("search_btn").textContent = t("search_btn");
  document.getElementById("applications-title").textContent = t("applications_title");
  document.getElementById("btn-applications-back").textContent = t("back_link");
  document.getElementById("btn-cv-gate-back").textContent = t("back_link");
  document.getElementById("welcome-body").textContent = t("welcome_body");
  document.getElementById("welcome-continue-btn").textContent = t("welcome_continue_btn");
  document.getElementById("profile-title").textContent = t("profile_title");
  document.getElementById("my-cvs-title").textContent = t("my_cvs_title");
  document.getElementById("btn-my-cvs-back").textContent = t("back_link");
  document.getElementById("my-cvs-upload-label").textContent = t("my_cvs_upload_label");
  document.getElementById("upload_new_cv_btn").textContent = t("upload_cv_btn");
  document.getElementById("tab-home-label").textContent = t("tab_home_label");
  document.getElementById("tab-search-label").textContent = t("tab_search_label");
  document.getElementById("tab-analyze-label").textContent = t("tab_analyze_label");
  document.getElementById("tab-profile-label").textContent = t("tab_profile_label");
  document.getElementById("checks-title").textContent = t("checks_title");
  document.getElementById("btn-checks-back").textContent = t("back_link");
  document.getElementById("profile-my-cvs-label").textContent = t("profile_my_cvs_btn");
  document.getElementById("profile-my-checks-label").textContent = t("profile_my_checks_btn");
  document.getElementById("profile-my-applications-label").textContent = t("profile_applications_btn");
  document.getElementById("my-checks-title").textContent = t("profile_my_checks_btn");
  document.getElementById("btn-my-checks-back").textContent = t("back_link");
  document.getElementById("profile-vacancy-alerts-label").textContent = t("profile_vacancy_alerts_btn");
  document.getElementById("vacancy-alerts-title").textContent = t("profile_vacancy_alerts_btn");
  document.getElementById("btn-vacancy-alerts-back").textContent = t("back_link");
  document.getElementById("vacancy-alerts-explainer").textContent = t("vacancy_alerts_explainer");
  document.getElementById("vacancy-alerts-title-label").textContent = t("vacancy_alerts_title_label");
  document.getElementById("alerts_job_title").placeholder = t("vacancy_alerts_title_placeholder");
  document.getElementById("vacancy-alerts-location-label").textContent = t("vacancy_alerts_location_label");
  document.getElementById("alerts_location").placeholder = t("vacancy_alerts_location_placeholder");
  document.getElementById("vacancy-alerts-toggle-label").textContent = t("vacancy_alerts_toggle_label");
  document.getElementById("save_vacancy_alerts_btn").textContent = t("vacancy_alerts_save_btn");

  const filterEl = document.getElementById("applications-filter");
  filterEl.innerHTML = ['all', 'applied', 'phone_screen', 'tech_interview', 'offer', 'rejected', 'ghosted']
    .map(s => `<option value="${s}">${escapeHtml(s === 'all' ? t('filter_all') : statusLabel(s))}</option>`).join("");
  const sortEl = document.getElementById("applications-sort");
  sortEl.innerHTML = `<option value="date">${escapeHtml(t('sort_date'))}</option><option value="score">${escapeHtml(t('sort_score'))}</option>`;
}
