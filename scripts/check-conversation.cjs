#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/check-conversation.cjs <session.jsonl>');
  process.exit(2);
}
try {
  const raw = fs.readFileSync(file,'utf8');
  const lines = raw.split(/\r?\n/).filter(l=>l.trim());
  const entries = lines.map(l=>JSON.parse(l));
  const messages = entries.filter(e=>e.type==='message' && e.message);
  const user = messages.filter(m=>m.message.role==='user').pop();
  const assistant = messages.filter(m=>m.message.role==='assistant').pop();
  console.log('Loaded', entries.length, 'entries,', messages.length, 'messages');
  console.log('Last user:', user ? JSON.stringify(user.message.content).slice(0,300) : 'none');
  console.log('Last assistant:', assistant ? JSON.stringify(assistant.message.content).slice(0,300) : 'none');
  process.exit(0);
} catch(err){
  console.error('Error parsing', err && err.message?err.message:err);
  process.exit(1);
}
