window.RESERVATION_CONFIG = {
  GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyNx1TJBKp0FRg7zXfs50d3cohPY00dO26ei3-z-fDi1fULuHxOaHrXUEr_3B6Bz3BcpQ/exec',
  LIFF_ID: '',

  STORE_NAME: 'eyelash Lelin（ルラン）',
  STORE_PHONE: '0276613520',
  HEADER_SUBTITLE: 'ご予約',
  RESERVATION_NOTICE: '変更、キャンセルはお電話またはLINEでお願いします。',

  SERVICE_NAME: 'まつ毛メニュー',
  SERVICE_DURATION_LABEL: '施術60分・片付け30分',
  MENU_SELECTION_ENABLED: true,
  EXTENSION_SELECTION_ENABLED: false,
  SLOT_SCREEN_IDLE_TIMEOUT_MS: 10 * 60 * 1000,
  MENUS: [
    { id: 'eyelash_extension', name: 'まつ毛エクステ', durationMinutes: 60, durationLabel: '60分' },
    { id: 'eyelash_perm', name: 'パーマ', durationMinutes: 60, durationLabel: '60分' }
  ],
  PAYMENT_MODE: 'none',
  PAYMENT_LABEL: '事前カード決済',
  ONSITE_PAYMENT_LABEL: '当日支払い',
  ADMIN_SESSION_KEY: 'lelinAdminKey'
};
