// import React from 'react';
import '../styles.css';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

export function Main() {
    const firebaseConfig = {
        // config

    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const firestore = firebase.firestore();

    const servers = {
        iceServers: [
            {
                urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
            },
        ],
        iceCandidatePoolSize: 10,
    };

    // Global State
    const pc = new RTCPeerConnection(servers);
    let localStream: any = null;
    let remoteStream: any = null;

    // HTML elements
    const webcamButton: any = document.getElementById('webcamButton');
    const webcamVideo: any = document.getElementById('webcamVideo');
    const callButton: any = document.getElementById('callButton');
    const callInput: any = document.getElementById('callInput');
    const answerButton: any = document.getElementById('answerButton');
    const remoteVideo: any = document.getElementById('remoteVideo');
    const hangupButton: any = document.getElementById('hangupButton');

    // 1. Setup media sources
    const webcamButtonClick = async () => {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        remoteStream = new MediaStream();

        // Push tracks from local stream to peer connection
        localStream.getTracks().forEach((track: any) => {
            pc.addTrack(track, localStream);
        });

        // Pull tracks from remote stream, add to video stream
        pc.ontrack = (event) => {
            event.streams[0].getTracks().forEach((track) => {
                remoteStream.addTrack(track);
            });

        };

        remoteVideo.srcObject = remoteStream;
        webcamVideo.srcObject = localStream;

        callButton.disabled = false;
        answerButton.disabled = false;
        webcamButton.disabled = true;

    }

    // 2. Create an offer
    const callButtonClick = async () => {
        // Reference Firestore collections for signaling
        const callDoc = firestore.collection('calls').doc();
        const offerCandidates = callDoc.collection('offerCandidates');
        const answerCandidates = callDoc.collection('answerCandidates');

        callInput.value = callDoc.id;

        // Get candidates for caller, save to db
        pc.onicecandidate = (event) => {
            event.candidate && offerCandidates.add(event.candidate.toJSON());
        };

        // Create offer
        const offerDescription = await pc.createOffer();
        await pc.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        await callDoc.set({ offer });

        // Listen for remote answer
        callDoc.onSnapshot((snapshot: any) => {
            const data = snapshot.data();
            if (!pc.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                pc.setRemoteDescription(answerDescription);
            }
        });

        // When answered, add candidate to peer connection
        answerCandidates.onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    pc.addIceCandidate(candidate);
                }
            });
        });

        hangupButton.disabled = false;
    }

    // 3. Answer the call with the unique ID
    const answerButtonClick = async () => {
        const callId = callInput.value;
        const callDoc = firestore.collection('calls').doc(callId);
        const answerCandidates = callDoc.collection('answerCandidates');
        const offerCandidates = callDoc.collection('offerCandidates');

        pc.onicecandidate = (event) => {
            event.candidate && answerCandidates.add(event.candidate.toJSON());
        };

        const callData: any = (await callDoc.get()).data();

        const offerDescription = callData.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        };

        await callDoc.update({ answer });

        offerCandidates.onSnapshot((snapshot: any) => {
            snapshot.docChanges().forEach((change: any) => {
                console.log(change);
                if (change.type === 'added') {
                    let data = change.doc.data();
                    pc.addIceCandidate(new RTCIceCandidate(data));
                }
            });
        });
    }

    return (
        <>
            <h2>1. Start your Webcam</h2>
            <div className="videos">
                <span>
                    <h3>Local Stream</h3>
                    <video id="webcamVideo" autoPlay playsInline></video>
                </span>
                <span>
                    <h3>Remote Stream</h3>
                    <video id="remoteVideo" autoPlay playsInline></video>
                </span>


            </div>

            <button id="webcamButton" onClick={webcamButtonClick}>Start webcam</button>
            <h2>2. Create a new Call</h2>
            <button id="callButton" onClick={callButtonClick} disabled>Create Call (offer)</button>

            <h2>3. Join a Call</h2>
            <p>Answer the call from a different browser window or device</p>

            <input id="callInput" />
            <button id="answerButton" onClick={answerButtonClick} disabled>Answer</button>

            <h2>4. Hangup</h2>

            <button id="hangupButton" disabled>Hangup</button>
        </>
    )
} 
