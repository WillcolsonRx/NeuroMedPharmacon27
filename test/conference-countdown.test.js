const test=require('node:test');
const assert=require('node:assert/strict');
const {conferenceCountdown,START,END}=require('../public/conference-countdown');

test('countdown measures days and seconds against the IST opening without timezone drift',()=>{
 assert.equal(START,Date.parse('2027-02-18T03:30:00Z'));
 assert.deepEqual(conferenceCountdown(START-90061000),{phase:'upcoming',days:1,hours:1,minutes:1,seconds:1});
 assert.equal(conferenceCountdown(START-1000).seconds,1);
});
test('countdown switches at opening and closing and never shows negative time',()=>{
 assert.deepEqual(conferenceCountdown(START),{phase:'active',days:0,hours:0,minutes:0,seconds:0});
 assert.equal(conferenceCountdown(END-1).phase,'active');
 assert.deepEqual(conferenceCountdown(END),{phase:'ended',days:0,hours:0,minutes:0,seconds:0});
 assert.equal(conferenceCountdown(END+86400000).days,0);
});
