(function applyIntroLocale() {
  var COPY = {
    bg: {
      eyebrow: 'Централен депозитар · CSD-BG',
      title: 'Добре дошли',
      lead: 'Това приложение показва исторически данни за свободен флот на емитенти, регистрирани в ЦДЦК.',
      stepsTitle: 'Как да започнете',
      step1Title: 'Прегледайте емитентите',
      step1Text: 'От началния списък търсете по име или ISIN, за да намерите компания.',
      step2Title: 'Отворете детайли и графика',
      step2Text: 'Изберете ред, за да видите таблица с показатели и интерактивна графика във времето.',
      step3Title: 'Опреснявайте данните',
      step3Text: 'Използвайте „Опресни“ от менюто, когато искате най-новите публикации от CSD-BG.',
      hint: 'Можете да отворите отново това ръководство от менюто „Помощ“.',
    },
    en: {
      eyebrow: 'Central Depository · CSD-BG',
      title: 'Welcome',
      lead: 'This app shows historical free-float data for issuers registered with CSD-BG.',
      stepsTitle: 'Getting started',
      step1Title: 'Browse issuers',
      step1Text: 'From the home list, search by name or ISIN to find a company.',
      step2Title: 'Open details and chart',
      step2Text: 'Select a row to view a metrics table and an interactive time-series chart.',
      step3Title: 'Refresh the data',
      step3Text: 'Use Refresh in the menu when you want the latest publications from CSD-BG.',
      hint: 'You can open this guide again from the Help menu item.',
    },
  };

  var params = new URLSearchParams(window.location.search);
  var lang = params.get('lang') === 'en' ? 'en' : 'bg';
  var strings = COPY[lang];

  document.documentElement.lang = lang;
  document.title = (lang === 'en' ? 'Welcome' : 'Добре дошли') + ' · CSD Free Float';

  document.querySelectorAll('[data-i18n]').forEach(function (node) {
    var key = node.getAttribute('data-i18n');
    if (key && strings[key]) {
      node.textContent = strings[key];
    }
  });
})();
