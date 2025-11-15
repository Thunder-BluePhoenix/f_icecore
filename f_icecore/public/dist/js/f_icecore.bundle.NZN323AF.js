(()=>{var p=(i,e)=>()=>(i&&(e=i(i=0)),e);var _=(i,e)=>()=>(e||i((e={exports:{}}).exports,e),e.exports);var c,h=p(()=>{c=class{constructor(){this.peerConnection=null,this.localStream=null,this.remoteStream=null,this.iceServers=[],this.callId=null,this.remoteUser=null,this.callType="audio",this.isCaller=!1,this.onRemoteStream=null,this.onLocalStream=null,this.onCallEnded=null,this.onError=null,this.onConnectionStateChange=null,this.init()}async init(){await this.loadIceServers(),this.setupRealtimeListeners(),this.startPresenceHeartbeat()}async loadIceServers(){try{let e=await frappe.call({method:"f_icecore.api.turn_credentials.get_ice_servers",callback:t=>{t.message&&(this.iceServers=t.message,console.log("ICE Servers loaded:",this.iceServers))}})}catch(e){console.error("Failed to load ICE servers:",e),this.iceServers=[{urls:"stun:stun.l.google.com:19302"}]}}setupRealtimeListeners(){let e=frappe.session.user;frappe.realtime.on(`f_icecore:webrtc_offer:${e}`,async t=>{console.log("Received WebRTC offer from:",t.from_user),await this.handleRemoteOffer(t)}),frappe.realtime.on(`f_icecore:webrtc_answer:${e}`,async t=>{console.log("Received WebRTC answer from:",t.from_user),await this.handleRemoteAnswer(t)}),frappe.realtime.on(`f_icecore:ice_candidate:${e}`,async t=>{console.log("Received ICE candidate from:",t.from_user),await this.handleRemoteIceCandidate(t)}),frappe.realtime.on(`f_icecore:call_ended:${e}`,t=>{console.log("Call ended by:",t.ended_by),this.endCall()})}async createPeerConnection(){let e={iceServers:this.iceServers};return this.peerConnection=new RTCPeerConnection(e),this.peerConnection.onicecandidate=t=>{t.candidate&&this.sendIceCandidate(t.candidate)},this.peerConnection.ontrack=t=>{console.log("Received remote track:",t.track.kind),this.remoteStream||(this.remoteStream=new MediaStream),this.remoteStream.addTrack(t.track),this.onRemoteStream&&this.onRemoteStream(this.remoteStream)},this.peerConnection.onconnectionstatechange=()=>{console.log("Connection state:",this.peerConnection.connectionState),this.onConnectionStateChange&&this.onConnectionStateChange(this.peerConnection.connectionState),this.peerConnection.connectionState==="failed"&&this.handleError("Connection failed")},this.peerConnection.oniceconnectionstatechange=()=>{console.log("ICE connection state:",this.peerConnection.iceConnectionState),this.peerConnection.iceConnectionState==="failed"&&this.handleError("ICE connection failed")},this.peerConnection}async startCall(e,t="audio",a=null){try{this.remoteUser=e,this.callType=t,this.callId=a,this.isCaller=!0,await this.getLocalStream(t),await this.createPeerConnection(),this.localStream.getTracks().forEach(l=>{this.peerConnection.addTrack(l,this.localStream)});let o=await this.peerConnection.createOffer();await this.peerConnection.setLocalDescription(o),await frappe.call({method:"f_icecore.api.signaling.send_offer",args:{to_user:e,offer_sdp:JSON.stringify(o),call_id:a}}),console.log("Call started, offer sent to:",e)}catch(o){console.error("Failed to start call:",o),this.handleError(o)}}async answerCall(e,t="audio",a=null){try{this.remoteUser=e,this.callType=t,this.callId=a,this.isCaller=!1,await this.getLocalStream(t),this.localStream.getTracks().forEach(o=>{this.peerConnection.addTrack(o,this.localStream)}),console.log("Call answered")}catch(o){console.error("Failed to answer call:",o),this.handleError(o)}}async getLocalStream(e){try{let t=this.getMediaConstraints(e);return this.localStream=await navigator.mediaDevices.getUserMedia(t),this.onLocalStream&&this.onLocalStream(this.localStream),this.localStream}catch(t){throw console.error("Failed to get local stream:",t),new Error("Could not access camera/microphone. Please check permissions.")}}getMediaConstraints(e){switch(e){case"video":return{audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0},video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}}};case"screen":return null;case"audio":default:return{audio:{echoCancellation:!0,noiseSuppression:!0,autoGainControl:!0},video:!1}}}async getScreenShare(){try{return this.localStream=await navigator.mediaDevices.getDisplayMedia({video:{cursor:"always"},audio:!1}),this.onLocalStream&&this.onLocalStream(this.localStream),this.localStream.getVideoTracks()[0].onended=()=>{console.log("Screen sharing stopped"),this.endCall()},this.localStream}catch(e){throw console.error("Failed to get screen share:",e),new Error("Could not access screen. Please check permissions.")}}async handleRemoteOffer(e){try{let t=JSON.parse(e.offer);this.peerConnection||await this.createPeerConnection(),await this.peerConnection.setRemoteDescription(new RTCSessionDescription(t));let a=await this.peerConnection.createAnswer();await this.peerConnection.setLocalDescription(a),await frappe.call({method:"f_icecore.api.signaling.send_answer",args:{to_user:e.from_user,answer_sdp:JSON.stringify(a),call_id:e.call_id}}),console.log("Answer sent to:",e.from_user)}catch(t){console.error("Failed to handle remote offer:",t),this.handleError(t)}}async handleRemoteAnswer(e){try{let t=JSON.parse(e.answer);await this.peerConnection.setRemoteDescription(new RTCSessionDescription(t)),console.log("Remote answer set")}catch(t){console.error("Failed to handle remote answer:",t),this.handleError(t)}}async handleRemoteIceCandidate(e){try{if(e.candidate){let t=new RTCIceCandidate(e.candidate);await this.peerConnection.addIceCandidate(t),console.log("ICE candidate added")}}catch(t){console.error("Failed to handle ICE candidate:",t)}}async sendIceCandidate(e){try{await frappe.call({method:"f_icecore.api.signaling.send_ice_candidate",args:{to_user:this.remoteUser,candidate:e.toJSON(),call_id:this.callId}})}catch(t){console.error("Failed to send ICE candidate:",t)}}toggleAudio(e){this.localStream&&this.localStream.getAudioTracks().forEach(t=>{t.enabled=e})}toggleVideo(e){this.localStream&&this.localStream.getVideoTracks().forEach(t=>{t.enabled=e})}async endCall(){this.localStream&&(this.localStream.getTracks().forEach(e=>e.stop()),this.localStream=null),this.peerConnection&&(this.peerConnection.close(),this.peerConnection=null),this.callId&&await frappe.call({method:"f_icecore.api.signaling.end_call",args:{call_id:this.callId}}),this.remoteStream=null,this.remoteUser=null,this.callId=null,this.onCallEnded&&this.onCallEnded(),console.log("Call ended")}handleError(e){console.error("WebRTC Error:",e),this.onError&&this.onError(e)}startPresenceHeartbeat(){setInterval(()=>{frappe.call({method:"f_icecore.api.presence.heartbeat",args:{},callback:e=>{console.log("Presence heartbeat sent")}})},6e4),frappe.call({method:"f_icecore.api.presence.heartbeat"})}};window.FIceCore=new c});var d,f=p(()=>{d=class{constructor(){this.currentCallWindow=null,this.incomingCallDialog=null,this.isAudioMuted=!1,this.isVideoMuted=!1,this.ringtone=null,this.callingTone=null,this.init()}init(){this.setupIncomingCallListener(),this.setupCallControls(),this.loadAudioAssets()}setupIncomingCallListener(){let e=frappe.session.user;frappe.realtime.on(`f_icecore:incoming_call:${e}`,t=>{console.log("Incoming call from:",t.from_user),this.showIncomingCallDialog(t),this.playRingtone()}),frappe.realtime.on(`f_icecore:call_accepted:${e}`,t=>{console.log("Call accepted by:",t.accepted_by),this.stopCallingTone()}),frappe.realtime.on(`f_icecore:call_rejected:${e}`,t=>{console.log("Call rejected by:",t.rejected_by),this.stopCallingTone(),frappe.show_alert({message:__("Call was declined"),indicator:"red"},5),this.closeCallWindow()})}setupCallControls(){}loadAudioAssets(){this.ringtone=new Audio("/assets/f_icecore/sounds/ringtone.mp3"),this.ringtone.loop=!0,this.callingTone=new Audio("/assets/f_icecore/sounds/calling.mp3"),this.callingTone.loop=!0}async initiateCall(e,t="audio"){try{let a=await this.getUserPresence(e);if(a.status==="offline"){frappe.msgprint(__("User is offline"));return}if(a.status==="in_call"){frappe.msgprint(__("User is already in a call"));return}let o=await frappe.call({method:"f_icecore.api.signaling.initiate_call",args:{to_user:e,call_type:t}});if(!o.message.success){frappe.msgprint(o.message.message);return}let l=o.message.call_session;this.showCallingWindow(e,t,l.name),await window.FIceCore.startCall(e,t,l.name),this.playCallingTone(),await this.updatePresence("in_call",{call_id:l.name})}catch(a){console.error("Failed to initiate call:",a),frappe.msgprint(__("Failed to start call"))}}showIncomingCallDialog(e){let{call_id:t,from_user:a,from_user_name:o,call_type:l}=e,n=l==="video"?"\u{1F4F9}":l==="screen"?"\u{1F5A5}\uFE0F":"\u{1F4DE}";this.incomingCallDialog=new frappe.ui.Dialog({title:__("Incoming Call"),static:!0,fields:[{fieldtype:"HTML",options:`
						<div class="f-icecore-incoming-call" style="text-align: center; padding: 30px;">
							<div class="caller-avatar" style="margin-bottom: 20px;">
								<img src="${frappe.utils.get_avatar(a)}"
									style="width: 80px; height: 80px; border-radius: 50%;">
							</div>
							<h3 style="margin-bottom: 10px;">${o}</h3>
							<p style="color: #888; margin-bottom: 30px;">
								${n} ${__(callType.charAt(0).toUpperCase()+callType.slice(1))} Call
							</p>
							<div class="call-actions" style="display: flex; justify-content: center; gap: 20px;">
								<button class="btn btn-success btn-lg" onclick="window.FIceCoreUI.acceptCall('${t}', '${a}', '${l}')">
									<i class="fa fa-phone"></i> ${__("Accept")}
								</button>
								<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.rejectCall('${t}')">
									<i class="fa fa-phone-slash"></i> ${__("Decline")}
								</button>
							</div>
						</div>
					`}]}),this.incomingCallDialog.show()}async acceptCall(e,t,a){try{this.incomingCallDialog&&this.incomingCallDialog.hide(),this.stopRingtone(),await frappe.call({method:"f_icecore.api.signaling.accept_call",args:{call_id:e}}),this.showCallWindow(t,a,e,!1),await window.FIceCore.answerCall(t,a,e),await this.updatePresence("in_call",{call_id:e})}catch(o){console.error("Failed to accept call:",o),frappe.msgprint(__("Failed to accept call"))}}async rejectCall(e){try{this.incomingCallDialog&&this.incomingCallDialog.hide(),this.stopRingtone(),await frappe.call({method:"f_icecore.api.signaling.reject_call",args:{call_id:e,reason:"User declined"}})}catch(t){console.error("Failed to reject call:",t)}}showCallingWindow(e,t,a){var n;let o=((n=frappe.boot.user_info[e])==null?void 0:n.fullname)||e,l=t==="video"?"\u{1F4F9}":t==="screen"?"\u{1F5A5}\uFE0F":"\u{1F4DE}";this.currentCallWindow=new frappe.ui.Dialog({title:__("Calling..."),static:!0,size:"large",fields:[{fieldtype:"HTML",options:`
						<div class="f-icecore-calling" style="text-align: center; padding: 40px;">
							<div class="caller-avatar" style="margin-bottom: 20px;">
								<img src="${frappe.utils.get_avatar(e)}"
									style="width: 100px; height: 100px; border-radius: 50%;">
							</div>
							<h3 style="margin-bottom: 10px;">${o}</h3>
							<p style="color: #888; margin-bottom: 30px;">
								${l} ${__("Calling...")}
							</p>
							<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.hangup()">
								<i class="fa fa-phone-slash"></i> ${__("Cancel")}
							</button>
						</div>
					`}]}),this.currentCallWindow.show()}showCallWindow(e,t,a,o){var s;let l=((s=frappe.boot.user_info[e])==null?void 0:s.fullname)||e,n=t==="video"||t==="screen";this.currentCallWindow=new frappe.ui.Dialog({title:__("In Call"),static:!0,size:"extra-large",fields:[{fieldtype:"HTML",options:`
						<div class="f-icecore-call-window">
							<div class="video-container" style="position: relative; background: #000; min-height: 500px; border-radius: 8px;">
								${n?`
									<video id="f-icecore-remote-video" autoplay playsinline
										style="width: 100%; height: 500px; object-fit: cover; border-radius: 8px;">
									</video>
									<video id="f-icecore-local-video" autoplay playsinline muted
										style="position: absolute; bottom: 20px; right: 20px; width: 200px; height: 150px;
										object-fit: cover; border-radius: 8px; border: 2px solid #fff;">
									</video>
								`:`
									<div style="display: flex; align-items: center; justify-content: center; height: 500px;">
										<div style="text-align: center;">
											<img src="${frappe.utils.get_avatar(e)}"
												style="width: 120px; height: 120px; border-radius: 50%; margin-bottom: 20px;">
											<h3 style="color: #fff;">${l}</h3>
											<p style="color: #aaa;" id="call-duration">00:00</p>
										</div>
									</div>
								`}
							</div>

							<div class="call-controls" style="display: flex; justify-content: center; gap: 15px; margin-top: 20px; padding: 20px;">
								<button class="btn btn-secondary btn-lg" id="toggle-audio" onclick="window.FIceCoreUI.toggleAudio()">
									<i class="fa fa-microphone"></i>
								</button>
								${n?`
									<button class="btn btn-secondary btn-lg" id="toggle-video" onclick="window.FIceCoreUI.toggleVideo()">
										<i class="fa fa-video"></i>
									</button>
								`:""}
								<button class="btn btn-danger btn-lg" onclick="window.FIceCoreUI.hangup()">
									<i class="fa fa-phone-slash"></i> ${__("End Call")}
								</button>
							</div>
						</div>
					`}]}),this.currentCallWindow.show(),this.setupStreamHandlers(n),this.startCallDurationCounter()}setupStreamHandlers(e){window.FIceCore.onLocalStream=t=>{if(e){let a=document.getElementById("f-icecore-local-video");a&&(a.srcObject=t)}},window.FIceCore.onRemoteStream=t=>{if(e){let a=document.getElementById("f-icecore-remote-video");a&&(a.srcObject=t)}},window.FIceCore.onCallEnded=()=>{this.closeCallWindow()},window.FIceCore.onError=t=>{frappe.msgprint({title:__("Call Error"),message:t.toString(),indicator:"red"}),this.closeCallWindow()}}toggleAudio(){this.isAudioMuted=!this.isAudioMuted,window.FIceCore.toggleAudio(!this.isAudioMuted);let e=document.getElementById("toggle-audio");e&&(e.innerHTML=this.isAudioMuted?'<i class="fa fa-microphone-slash"></i>':'<i class="fa fa-microphone"></i>',e.classList.toggle("btn-danger",this.isAudioMuted))}toggleVideo(){this.isVideoMuted=!this.isVideoMuted,window.FIceCore.toggleVideo(!this.isVideoMuted);let e=document.getElementById("toggle-video");e&&(e.innerHTML=this.isVideoMuted?'<i class="fa fa-video-slash"></i>':'<i class="fa fa-video"></i>',e.classList.toggle("btn-danger",this.isVideoMuted))}async hangup(){await window.FIceCore.endCall(),this.closeCallWindow(),await this.updatePresence("online")}closeCallWindow(){this.currentCallWindow&&(this.currentCallWindow.hide(),this.currentCallWindow=null),this.stopRingtone(),this.stopCallingTone()}startCallDurationCounter(){let e=0,t=setInterval(()=>{e++;let a=Math.floor(e/60),o=e%60,l=`${String(a).padStart(2,"0")}:${String(o).padStart(2,"0")}`,n=document.getElementById("call-duration");n?n.textContent=l:clearInterval(t)},1e3)}playRingtone(){this.ringtone&&this.ringtone.play().catch(e=>console.error("Failed to play ringtone:",e))}stopRingtone(){this.ringtone&&(this.ringtone.pause(),this.ringtone.currentTime=0)}playCallingTone(){this.callingTone&&this.callingTone.play().catch(e=>console.error("Failed to play calling tone:",e))}stopCallingTone(){this.callingTone&&(this.callingTone.pause(),this.callingTone.currentTime=0)}async getUserPresence(e){return(await frappe.call({method:"f_icecore.api.presence.get_user_presence",args:{user:e}})).message}async updatePresence(e,t){await frappe.call({method:"f_icecore.api.presence.update_presence",args:{status:e,metadata:t}})}addCallButtonToUserCard(e,t){let a=`
			<button class="btn btn-xs btn-default"
				onclick="window.FIceCoreUI.initiateCall('${t}', 'audio')"
				title="${__("Audio Call")}">
				<i class="fa fa-phone"></i>
			</button>
			<button class="btn btn-xs btn-default"
				onclick="window.FIceCoreUI.initiateCall('${t}', 'video')"
				title="${__("Video Call")}">
				<i class="fa fa-video"></i>
			</button>
		`;$(e).append(a)}};window.FIceCoreUI=new d});var x=_((E,r)=>{h();f();frappe.ready(()=>{console.log("F-IceCore initialized"),w(),v()});function w(){$(document).on("keydown",i=>{(i.ctrlKey||i.metaKey)&&i.shiftKey&&i.key==="C"&&(i.preventDefault(),u()),(i.ctrlKey||i.metaKey)&&i.shiftKey&&i.key==="H"&&(i.preventDefault(),window.FIceCoreUI.currentCallWindow&&window.FIceCoreUI.hangup()),(i.ctrlKey||i.metaKey)&&i.key==="m"&&(i.preventDefault(),window.FIceCoreUI.currentCallWindow&&window.FIceCoreUI.toggleAudio())})}function v(){y(),frappe.boot.desk_settings&&frappe.pages.Desk&&void 0}function y(){if(frappe.boot.user&&frappe.boot.user.name!=="Guest"){let i=$(".navbar-right");if(i.length){let e=$(`
				<li>
					<a href="#" onclick="window.FIceCoreUI.showCallMenu(); return false;"
						title="${__("F-IceCore Calls")}">
						<i class="fa fa-phone"></i>
					</a>
				</li>
			`);i.prepend(e)}}}function u(){let i=new frappe.ui.Dialog({title:__("Quick Call"),fields:[{fieldtype:"Link",fieldname:"user",label:__("Select User"),options:"User",filters:{enabled:1,user_type:"System User"},reqd:1,get_query:()=>({filters:{name:["!=",frappe.session.user],enabled:1}})},{fieldtype:"Select",fieldname:"call_type",label:__("Call Type"),options:`Audio
Video`,default:"Audio",reqd:1}],primary_action_label:__("Call"),primary_action:e=>{let t=e.call_type.toLowerCase();window.FIceCoreUI.initiateCall(e.user,t),i.hide()}});i.show()}window.FIceCoreUI.showCallMenu=function(){new frappe.ui.Dialog({title:__("F-IceCore Calls"),size:"large",fields:[{fieldtype:"HTML",options:`
					<div class="f-icecore-menu">
						<ul class="nav nav-tabs" role="tablist">
							<li role="presentation" class="active">
								<a href="#online-users" role="tab" data-toggle="tab">
									${__("Online Users")}
								</a>
							</li>
							<li role="presentation">
								<a href="#call-history" role="tab" data-toggle="tab">
									${__("Call History")}
								</a>
							</li>
							<li role="presentation">
								<a href="#call-stats" role="tab" data-toggle="tab">
									${__("Statistics")}
								</a>
							</li>
						</ul>
						<div class="tab-content" style="margin-top: 15px;">
							<div role="tabpanel" class="tab-pane active" id="online-users">
								<div id="f-icecore-online-users-list"></div>
							</div>
							<div role="tabpanel" class="tab-pane" id="call-history">
								<div id="f-icecore-call-history-list"></div>
							</div>
							<div role="tabpanel" class="tab-pane" id="call-stats">
								<div id="f-icecore-call-stats"></div>
							</div>
						</div>
					</div>
				`}]}).show(),g(),$('a[href="#call-history"]').on("shown.bs.tab",m),$('a[href="#call-stats"]').on("shown.bs.tab",C)};function g(){frappe.call({method:"f_icecore.api.presence.get_call_capable_users",callback:i=>{i.message&&b(i.message)}})}function b(i){let e=$("#f-icecore-online-users-list");if(e.empty(),i.length===0){e.html(`<p class="text-muted">${__("No users online")}</p>`);return}i.forEach(t=>{let a=$(`
			<div class="f-icecore-user-card">
				<div class="user-avatar">
					<img src="${frappe.utils.get_avatar(t.user)}" alt="${t.full_name}">
					<span class="f-icecore-presence ${t.status}"></span>
				</div>
				<div class="user-info">
					<div class="user-name">${t.full_name}</div>
					<div class="user-status">${__(t.status)}</div>
				</div>
				<div class="call-actions">
					<button class="audio" onclick="window.FIceCoreUI.initiateCall('${t.user}', 'audio')" title="${__("Audio Call")}">
						<i class="fa fa-phone"></i>
					</button>
					<button class="video" onclick="window.FIceCoreUI.initiateCall('${t.user}', 'video')" title="${__("Video Call")}">
						<i class="fa fa-video"></i>
					</button>
				</div>
			</div>
		`);e.append(a)})}function m(){frappe.call({method:"f_icecore.api.call_session.get_call_history",args:{limit:50},callback:i=>{i.message&&I(i.message)}})}function I(i){let e=$("#f-icecore-call-history-list");if(e.empty(),i.length===0){e.html(`<p class="text-muted">${__("No call history")}</p>`);return}i.forEach(t=>{let a=t.direction==="incoming"?"incoming":"outgoing",o=t.call_type==="video"?"fa-video":"fa-phone",l=frappe.datetime.comment_when(t.creation),n=t.duration?frappe.format(t.duration,{fieldtype:"Duration"}):"-",s=$(`
			<div class="f-icecore-call-history-item">
				<div class="call-icon ${a}">
					<i class="fa ${o}"></i>
				</div>
				<div class="call-info">
					<div class="call-user">${t.other_user_name}</div>
					<div class="call-meta">
						${t.direction==="incoming"?__("Incoming"):__("Outgoing")} \u2022
						${__(t.status)} \u2022
						${l} \u2022
						${n}
					</div>
				</div>
			</div>
		`);e.append(s)})}function C(){frappe.call({method:"f_icecore.api.call_session.get_call_stats",callback:i=>{i.message&&S(i.message)}})}function S(i){let e=$("#f-icecore-call-stats");e.empty();let t=`
		<div class="row">
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${i.total_calls}</h3>
					<p class="text-muted">${__("Total Calls")}</p>
				</div>
			</div>
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${i.answered_calls}</h3>
					<p class="text-muted">${__("Answered Calls")}</p>
				</div>
			</div>
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${i.missed_calls}</h3>
					<p class="text-muted">${__("Missed Calls")}</p>
				</div>
			</div>
			<div class="col-sm-6 col-md-3">
				<div class="well text-center">
					<h3>${i.total_duration_minutes}m</h3>
					<p class="text-muted">${__("Total Duration")}</p>
				</div>
			</div>
		</div>
		<div class="row">
			<div class="col-md-6">
				<div class="well">
					<h4>${__("Answer Rate")}</h4>
					<div class="progress">
						<div class="progress-bar progress-bar-success" style="width: ${i.answer_rate}%">
							${i.answer_rate}%
						</div>
					</div>
				</div>
			</div>
			<div class="col-md-6">
				<div class="well">
					<h4>${__("Recent Activity")}</h4>
					<p>${i.recent_calls_7d} ${__("calls in the last 7 days")}</p>
				</div>
			</div>
		</div>
	`;e.html(t)}typeof r!="undefined"&&r.exports&&(r.exports={showQuickCallDialog:u,loadOnlineUsers:g,loadCallHistory:m,loadCallStats:C})});x();})();
//# sourceMappingURL=f_icecore.bundle.NZN323AF.js.map
