(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // ../f_icecore/f_icecore/public/js/f_icecore.bundle.js
  var require_f_icecore_bundle = __commonJS({
    "../f_icecore/f_icecore/public/js/f_icecore.bundle.js"(exports, module) {
      $(document).ready(() => {
        if (typeof frappe === "undefined") {
          console.warn("F-IceCore Bundle: Frappe not yet loaded, waiting...");
          return;
        }
        console.log("F-IceCore Bundle v24 initialized");
        setupKeyboardShortcuts();
        enhanceUserInterface();
      });
      function setupKeyboardShortcuts() {
        $(document).on("keydown", (e) => {
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") {
            e.preventDefault();
            showQuickCallDialog();
          }
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "H") {
            e.preventDefault();
            if (window.FIceCoreUI && window.FIceCoreUI.currentCallWindow) {
              window.FIceCoreUI.hangup();
            }
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "m") {
            e.preventDefault();
            if (window.FIceCoreUI && window.FIceCoreUI.currentCallWindow) {
              window.FIceCoreUI.toggleAudio();
            }
          }
        });
      }
      function enhanceUserInterface() {
        addCallMenu();
        if (frappe.boot.desk_settings && frappe.pages.Desk) {
          addOnlineUsersWidget();
        }
      }
      function addCallMenu() {
        if (frappe.boot.user && frappe.boot.user.name !== "Guest") {
          const navbar = $(".navbar-right");
          if (navbar.length) {
            const callButton = $(`
				<li id="f-icecore-nav-btn">
					<a href="#" onclick="if(window.FIceCoreUI && window.FIceCoreUI.showCallMenu) { window.FIceCoreUI.showCallMenu(); } else { frappe.msgprint('Call UI not ready yet'); } return false;"
						title="${__("F-IceCore Calls")}">
						<i class="fa fa-phone"></i>
					</a>
				</li>
			`);
            navbar.prepend(callButton);
          }
        }
      }
      function addOnlineUsersWidget() {
      }
      function showQuickCallDialog() {
        const dialog = new frappe.ui.Dialog({
          title: __("Quick Call"),
          fields: [
            {
              fieldtype: "Link",
              fieldname: "user",
              label: __("Select User"),
              options: "User",
              filters: { "enabled": 1, "user_type": "System User" },
              reqd: 1,
              get_query: () => {
                return {
                  filters: {
                    "name": ["!=", frappe.session.user],
                    "enabled": 1
                  }
                };
              }
            },
            {
              fieldtype: "Select",
              fieldname: "call_type",
              label: __("Call Type"),
              options: "Audio\nVideo",
              default: "Audio",
              reqd: 1
            }
          ],
          primary_action_label: __("Call"),
          primary_action: (values) => {
            const callType = values.call_type.toLowerCase();
            if (window.FIceCoreUI && window.FIceCoreUI.initiateCall) {
              window.FIceCoreUI.initiateCall(values.user, callType);
            }
            dialog.hide();
          }
        });
        dialog.show();
      }
      if (typeof module !== "undefined" && module.exports) {
        module.exports = {
          showQuickCallDialog,
          setupKeyboardShortcuts,
          enhanceUserInterface
        };
      }
    }
  });
  require_f_icecore_bundle();
})();
//# sourceMappingURL=f_icecore.bundle.XAYCT464.js.map
