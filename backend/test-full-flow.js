/**
 * Full conversational flow test for coffee classification
 * Tests: coffee -> (answers) -> should ask about bulk/retail packaging
 */

const http = require('http');

function makeRequest(data) {
  return new Promise((resolve, reject) => {
    const jsonData = JSON.stringify(data);
    const options = {
      hostname: 'localhost',
      port: 8000,
      path: '/api/classify-conversational',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(jsonData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error('Invalid JSON: ' + body));
        }
      });
    });
    req.on('error', reject);
    req.write(jsonData);
    req.end();
  });
}

async function testCoffeeFlow() {
  console.log('='.repeat(80));
  console.log('COFFEE CLASSIFICATION FLOW TEST');
  console.log('='.repeat(80));

  // Round 1: Start conversation with "coffee"
  console.log('\n>>> ROUND 1: Starting with "coffee"');
  const round1 = await makeRequest({
    sessionId: 'test-coffee-' + Date.now(),
    productDescription: 'coffee'
  });

  console.log('Response type:', round1.responseType);

  if (round1.responseType === 'questions') {
    console.log('Questions asked:');
    round1.questions.forEach((q, i) => {
      console.log(`  ${i+1}. ${q.text}`);
      console.log(`     Options: ${q.options.join(', ')}`);
    });

    // Build answers - Roasted, Not decaffeinated, Arabica Cherry
    const answers = {};
    for (const q of round1.questions) {
      const qLower = q.text.toLowerCase();
      if (qLower.includes('roast') || qLower.includes('state')) {
        answers[q.id] = q.options.find(o => o.toLowerCase().includes('roasted') && !o.toLowerCase().includes('not roasted') && !o.toLowerCase().includes('unroasted')) || 'Roasted';
      } else if (qLower.includes('decaf')) {
        answers[q.id] = q.options.find(o => o.toLowerCase().includes('not decaf')) || 'Not decaffeinated';
      } else if (qLower.includes('species') || qLower.includes('type')) {
        answers[q.id] = q.options.find(o => o.toLowerCase().includes('arabica')) || 'Arabica Cherry';
      } else if (qLower.includes('process')) {
        answers[q.id] = q.options.find(o => o.toLowerCase().includes('cherry')) || 'Cherry';
      } else {
        // Default to first option
        answers[q.id] = q.options[0];
      }
    }

    console.log('\n>>> ROUND 2: Answering questions');
    console.log('Answers:', answers);

    const round2 = await makeRequest({
      sessionId: round1.sessionId || 'test-coffee-' + Date.now(),
      conversationId: round1.conversationId,
      answers: answers
    });

    console.log('\nRound 2 Response type:', round2.responseType);

    if (round2.responseType === 'questions') {
      console.log('✅ SUCCESS: System is asking MORE questions (likely about packaging!)');
      console.log('Questions asked:');
      round2.questions.forEach((q, i) => {
        console.log(`  ${i+1}. ${q.text}`);
        console.log(`     Options: ${q.options.join(', ')}`);
      });

      // Check if it's asking about bulk/packaging
      const hasBulkQuestion = round2.questions.some(q =>
        q.text.toLowerCase().includes('bulk') ||
        q.text.toLowerCase().includes('packaging') ||
        q.text.toLowerCase().includes('pack')
      );

      if (hasBulkQuestion) {
        console.log('\n✅✅ PERFECT: System is asking about BULK PACKAGING!');
      } else {
        console.log('\n⚠️ System asked questions but not about bulk/packaging');
      }
    } else if (round2.responseType === 'classification') {
      console.log('\n❌ PROBLEM: System classified WITHOUT asking about packaging');
      console.log('Classified as:', round2.result?.hsCode, '-', round2.result?.description);
      console.log('Confidence:', round2.result?.confidence);

      if (round2.result?.hsCode?.endsWith('.90')) {
        console.log('\n❌❌ CRITICAL: Classified as "Other" (.90) without asking about bulk!');
      }
    } else {
      console.log('Unexpected response:', JSON.stringify(round2, null, 2));
    }
  } else if (round1.responseType === 'classification') {
    console.log('Direct classification (no questions):', round1.result?.hsCode);
  } else {
    console.log('Unexpected response:', JSON.stringify(round1, null, 2));
  }

  console.log('\n' + '='.repeat(80));
}

testCoffeeFlow().catch(console.error);
