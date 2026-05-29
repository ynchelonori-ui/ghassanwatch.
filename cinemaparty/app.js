let ws;
let localStream;
let peerConnection;
let roomID;
let myRole = ""; // owner أو guest

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" } // سيرفر مجاني من جوجل لربط الـ IPs
    ]
};

function joinRoom() {
    roomID = document.getElementById("roomInput").value.trim();
    if (!roomID) return alert("الرجاء إدخال اسم الغرفة");

    document.getElementById("roomDisplay").innerText = "غرفة: " + roomID;
    document.getElementById("setupScreen").style.display = "none";

    // ربط مع سيرفر الـ C++ (قم بتغيير الـ IP عند الرفع على السيرفر الخارجي)
    ws = new WebSocket(`ws = new WebSocket(`ws = new WebSocket(`wss://ghassan-watch.onrender.com/room/${roomID}`);`);

    ws.onmessage = async (message) => {
        const data = JSON.parse(message.data);

        switch (data.type) {
            case "role":
                myRole = data.role;
                if (myRole === "owner") {
                    document.getElementById("shareBtn").style.display = "inline-block";
                    document.getElementById("status").innerText = "أنت مالك الغرفة. انتظر دخول الطرف الآخر ثم شارك الفيلم.";
                } else {
                    document.getElementById("status").innerText = "أنت ضيف. انتظر قيام المالك بمشاركة الشاشة.";
                }
                break;

            case "user-joined":
                document.getElementById("status").innerText = "متصل مع الطرف الآخر! يمكنك بدء البث الآن.";
                createPeerConnection();
                break;

            case "offer":
                if (myRole === "guest") {
                    createPeerConnection();
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    ws.send(JSON.stringify({ type: "answer", answer: answer }));
                }
                break;

            case "answer":
                if (myRole === "owner") {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                }
                break;

            case "candidate":
                if (peerConnection) {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
                break;

            case "chat":
                appendMessage(data.text, "other");
                break;

            case "user-left":
                document.getElementById("status").innerText = "غادر الطرف الآخر الغرفة.";
                if (peerConnection) peerConnection.close();
                break;
        }
    };
}

// إنشاء اتصال الـ WebRTC
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(config);

    // استقبال البث (للضيف)
    peerConnection.ontrack = (event) => {
        const videoElement = document.getElementById("screenVideo");
        if (videoElement.srcObject !== event.streams[0]) {
            videoElement.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    // إذا كان هناك بث محلي (للمالك) يتم إضافته للاتصال
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }
}

// ميزة مشاركة الشاشة (للمالك فقط)
async function startScreenShare() {
    try {
        // طلب مشاركة الشاشة مع صوت النظام الداخلي (مهم جداً لسماع صوت الفيلم)
        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: { echoCancellation: false, noiseSuppression: false } 
        });

        document.getElementById("screenVideo").srcObject = localStream;

        // إضافة تراك الفيديو والصوت للـ Peer Connection
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // عمل Offer وإرساله للضيف
const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer: offer }));

        document.getElementById("status").innerText = "يتم الآن عرض الفيلم ومشاركته...";
    } catch (err) {
        console.error("خطأ في مشاركة الشاشة: ", err);
    }
}

// نظام الشات
function sendMessage() {
    const input = document.getElementById("chatInput");
    const text = input.value.trim();
    if (!text) return;

    appendMessage(text, "me");
    ws.send(JSON.stringify({ type: "chat", text: text }));
    input.value = "";
}

function appendMessage(text, sender) {
    const chatMessages = document.getElementById("chatMessages");
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", sender);
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // النزول لآخر رسالة تلقائياً
}
