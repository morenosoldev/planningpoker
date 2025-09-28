// Simple test script to test the guest join endpoint
const fetch = require('node-fetch');

async function testGuestJoin() {
    try {
        console.log('Testing guest join endpoint...');
        const response = await fetch('http://localhost:8080/guest/join', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username: 'TestUser',
                room_code: 'ABC123'
            })
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers.raw());
        
        const text = await response.text();
        console.log('Response body:', text);

        if (response.status === 401) {
            console.log('ERROR: Got 401 Unauthorized - this means the request hit the wrong endpoint');
        }
    } catch (error) {
        console.error('Request failed:', error.message);
    }
}

testGuestJoin();