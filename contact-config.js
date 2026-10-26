"use strict";
// Formspree管理画面で発行されたURLを設定。未取得のメールアドレスや仮URLは設定しない。
// プライバシーポリシーを正式に確定後、privacyPolicyApprovedをtrueにする。
window.CONTACT_CONFIG = Object.freeze({
  endpoint: "",
  privacyPolicyApproved: false
});
