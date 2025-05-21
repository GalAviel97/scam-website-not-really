// Video streams setup
const streams = [
    "https://ynet-live-01.ynet-pic1.yit.co.il/ynet/live.m3u8",
    "https://ynet-live-02.ynet-pic1.yit.co.il/ynet/live.m3u8",
    "https://ynet-live-03.ynet-pic1.yit.co.il/ynet/live.m3u8",
    "https://ynet-live-04.ynet-pic1.yit.co.il/ynet/live.m3u8",
    "https://ynet-live-05.ynet-pic1.yit.co.il/ynet/live.m3u8",
    "https://con-g.gostreaming.tv/P2-Con-g2/myStream/playlist.m3u8",
    "https://reshet.g-mana.live/media/cdefce3a-14ec-46cc-a147-1275c4a8b9ed/profile/1/profileManifest.m3u8",
    "https://kan11.media.kan.org.il/hls/live/2024514/2024514/source1_2.5k/chunklist.m3u8",
    "https://cdn1.cast-tv.com/23595/Live_Kotel3_ABR/playlist.m3u8",
    "https://cdn1.cast-tv.com/23595/Live_Kotel2_ABR/playlist.m3u8",
    "https://cdn1.cast-tv.com/23595/Live_Kotel1_ABR/playlist.m3u8",
    "https://bcovlive-a.akamaihd.net/d89ede8094c741b7924120b27764153c/eu-central-1/5377161796001/profile_0/chunklist.m3u8"
];

streams.forEach((url, index) => {
    const video = document.getElementById(`video${index + 1}`);
    if (video) {
        video.autoplay = true;
        video.muted = true;

        if (url && Hls.isSupported()) {
            const hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(video);
        } else if (url && video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
        }

        // Handle Fullscreen Changes
        video.addEventListener('fullscreenchange', () => {
            if (document.fullscreenElement) {
                video.style.objectFit = 'contain';
            } else {
                video.style.objectFit = 'contain';
            }
        });
    }
});

// Clock Script
function updateClock() {
    const now = new Date();
    const options = { timeZone: 'Asia/Jerusalem', hour12: false };
    const timeString = now.toLocaleTimeString('en-GB', options);
    document.getElementById('clock').textContent = timeString;
}
setInterval(updateClock, 1000);
updateClock(); // Initial call

// Initialize previous alerts variables
let previousLiveAlerts = [];
let previousHistoryAlerts = [];

// Function to compare two alerts arrays
function alertsAreEqual(a1, a2) {
    if (a1.length !== a2.length) return false;

    for (let i = 0; i < a1.length; i++) {
        const alert1 = a1[i];
        const alert2 = a2[i];

        if (
            alert1.time !== alert2.time ||
            alert1.threat !== alert2.threat ||
            alert1.isDrill !== alert2.isDrill ||
            alert1.cities.length !== alert2.cities.length
        ) {
            return false;
        }

        // Compare cities
        for (let j = 0; j < alert1.cities.length; j++) {
            if (alert1.cities[j] !== alert2.cities[j]) {
                return false;
            }
        }
    }

    return true;
}

// Fetch and Update Live Alerts
async function fetchLiveAlerts() {
    try {
        const response = await fetch('https://alert.galaviel.com/livealerts.json');
        const alerts = await response.json();

        // Compare new alerts with previous live alerts
        if (!alertsAreEqual(alerts, previousLiveAlerts)) {
            // Alerts have changed, update the DOM
            const ulContainer = document.getElementById('live-ul-container');
            ulContainer.innerHTML = ''; // Clear previous alerts

            alerts.forEach(alert => {
                const li = document.createElement('li');
                li.className = 'area-container';

                const div = document.createElement('div');
                div.className = 'area-text';

                // Format the time
                const alertTime = new Date(alert.time * 1000);
                const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jerusalem' };
                const timeString = alertTime.toLocaleTimeString('en-GB', options);

                // Combine the cities into a string
                const citiesString = alert.cities.join(', ');

                // Check if it's a drill
                const drillText = alert.isDrill ? ' (תרגול)' : '';

                div.textContent = `${timeString} - ${citiesString}${drillText}`;

                li.appendChild(div);
                ulContainer.appendChild(li);
            });

            // Update previous live alerts
            previousLiveAlerts = alerts;
        } else {
            // Alerts have not changed, do nothing
            console.log('No new live alerts');
        }

    } catch (error) {
        console.error('Error fetching live alerts:', error);
    }
}

async function fetchHistoryAlerts() {
    try {
        const response = await fetch('https://alert.galaviel.com/alerthistory.json');
        const data = await response.json();

        console.log('Fetched Historical Alerts Data:', data);

        // Ensure 'alerts' exists in the JSON structure
        const alerts = data.alerts; // Access the 'alerts' array directly

        if (!alerts || !Array.isArray(alerts) || alerts.length === 0) {
            console.log('No historical alerts found in data.');
            return;
        }

        // Compare new alerts with previous history alerts
        if (!alertsAreEqual(alerts, previousHistoryAlerts)) {
            const ulContainer = document.getElementById('history-ul-container');
            ulContainer.innerHTML = ''; // Clear previous alerts

            alerts.forEach(alert => {
                console.log('Full Alert Object:', alert); // Log full alert object to inspect

                const li = document.createElement('li');
                li.className = 'area-container';

                const div = document.createElement('div');
                div.className = 'area-text';

                // Convert the Unix timestamp to a Date object
                let alertTime = new Date(alert.time * 1000);

                // Format the date and time string
                const timeString = alertTime.toLocaleString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Jerusalem'
                });

                // Join all city names in the 'cities' array into a single string
                const citiesString = alert.cities && Array.isArray(alert.cities) ? alert.cities.join(', ') : 'Unknown Location';

                // Check if it's a drill
                const drillText = alert.isDrill ? ' (תרגול)' : '';

                div.textContent = `${timeString} - ${citiesString}${drillText}`;

                li.appendChild(div);
                ulContainer.appendChild(li);
            });

            // Update previous history alerts
            previousHistoryAlerts = alerts;
        } else {
            console.log('No new historical alerts');
        }

    } catch (error) {
        console.error('Error fetching historical alerts:', error);
    }
}

// Fetch live alerts every 1 second
setInterval(fetchLiveAlerts, 1000);
fetchLiveAlerts();

// Fetch historical alerts every 30 seconds
setInterval(fetchHistoryAlerts, 30000);
fetchHistoryAlerts();

// ---------------------------
// Recording Functionality
// ---------------------------

// We'll maintain a map of { videoId: { recorder, chunks, isRecording } }
const recorders = {};

document.querySelectorAll('.record-btn').forEach(button => {
    button.addEventListener('click', async () => {
        const videoId = button.getAttribute('data-video-id');
        const videoElement = document.getElementById(videoId);

        // If we haven't set up a recorder object for this video yet, initialize
        if (!recorders[videoId]) {
            recorders[videoId] = {
                recorder: null,
                chunks: [],
                isRecording: false
            };
        }

        const recorderObj = recorders[videoId];

        if (!recorderObj.isRecording) {
            // Start recording
            // Make sure the video is playing and capture the stream
            try {
                // Ensure video is playing
                if (videoElement.paused) {
                    await videoElement.play();
                }

                const stream = videoElement.captureStream();
                const recorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

                recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        recorderObj.chunks.push(event.data);
                    }
                };
                recorder.onstop = () => {
                    const blob = new Blob(recorderObj.chunks, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${videoId}_recorded_video.webm`;
                    a.click();
                    URL.revokeObjectURL(url);

                    // Reset chunks
                    recorderObj.chunks = [];
                };

                recorder.start();
                recorderObj.recorder = recorder;
                recorderObj.isRecording = true;
                button.textContent = 'Stop Recording';
            } catch (err) {
                console.error('Error starting recording:', err);
                alert('Could not start recording. Check if the video is playable and not restricted.');
            }

        } else {
            // Stop recording
            recorderObj.recorder.stop();
            recorderObj.isRecording = false;
            button.textContent = 'Start Recording';
        }
    });
});
