(()=>{var a=(e,n)=>()=>(n||e((n={exports:{}}).exports,n),n.exports);var c=a((f,i)=>{$(document).ready(()=>{if(typeof frappe=="undefined"){console.warn("F-IceCore Bundle: Frappe not yet loaded, waiting...");return}console.log("F-IceCore Bundle v24 initialized"),o(),t()});function o(){$(document).on("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==="C"&&(e.preventDefault(),l()),(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==="H"&&(e.preventDefault(),window.FIceCoreUI&&window.FIceCoreUI.currentCallWindow&&window.FIceCoreUI.hangup()),(e.ctrlKey||e.metaKey)&&e.key==="m"&&(e.preventDefault(),window.FIceCoreUI&&window.FIceCoreUI.currentCallWindow&&window.FIceCoreUI.toggleAudio())})}function t(){d(),frappe.boot.desk_settings&&frappe.pages.Desk&&void 0}function d(){if(frappe.boot.user&&frappe.boot.user.name!=="Guest"){let e=$(".navbar-right");if(e.length){let n=$(`
				<li id="f-icecore-nav-btn">
					<a href="#" onclick="if(window.FIceCoreUI && window.FIceCoreUI.showCallMenu) { window.FIceCoreUI.showCallMenu(); } else { frappe.msgprint('Call UI not ready yet'); } return false;"
						title="${__("F-IceCore Calls")}">
						<i class="fa fa-phone"></i>
					</a>
				</li>
			`);e.prepend(n)}}}function l(){let e=new frappe.ui.Dialog({title:__("Quick Call"),fields:[{fieldtype:"Link",fieldname:"user",label:__("Select User"),options:"User",filters:{enabled:1,user_type:"System User"},reqd:1,get_query:()=>({filters:{name:["!=",frappe.session.user],enabled:1}})},{fieldtype:"Select",fieldname:"call_type",label:__("Call Type"),options:`Audio
Video`,default:"Audio",reqd:1}],primary_action_label:__("Call"),primary_action:n=>{let r=n.call_type.toLowerCase();window.FIceCoreUI&&window.FIceCoreUI.initiateCall&&window.FIceCoreUI.initiateCall(n.user,r),e.hide()}});e.show()}typeof i!="undefined"&&i.exports&&(i.exports={showQuickCallDialog:l,setupKeyboardShortcuts:o,enhanceUserInterface:t})});c();})();
//# sourceMappingURL=f_icecore.bundle.ILR5RYLV.js.map
