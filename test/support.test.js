const test = require('node:test')
const assert = require('node:assert/strict')
const { detectCategory, knowledge, retrieveKnowledge } = require('../dist/support/knowledge.js')

test('recognizes common buyer and seller support intent', () => {
  assert.equal(detectCategory('How do I upload my listing?'), 'selling')
  assert.equal(detectCategory('I cannot browse products'), 'buying')
})

test('retrieves grounded answers despite simple spelling variation/context words', () => {
  const results = retrieveKnowledge('plz help, my prodcut wont upload')
  assert.ok(results.some((entry) => entry.id === 'create-listing'))
})

test('returns no knowledge match for unrelated requests', () => {
  assert.deepEqual(retrieveKnowledge('tell me a joke about outer space'), [])
})

test('FAQ content includes varied questions and in-app actions', () => {
  assert.ok(knowledge.length >= 25)
  assert.ok(knowledge.every((entry) => entry.questions.length >= 2))
  assert.ok(knowledge.every((entry) => !entry.action || entry.action.path.startsWith('/')))
})

test('covers account, payment, listing visibility, and human support questions', () => {
  assert.ok(retrieveKnowledge('I forgot my password').some((entry) => entry.id === 'password'))
  assert.ok(retrieveKnowledge('Can I pay through Connect').some((entry) => entry.id === 'payment'))
  assert.ok(retrieveKnowledge('Why is my listing not visible').some((entry) => entry.id === 'listing-review'))
  assert.ok(retrieveKnowledge('I want to talk to a person').some((entry) => entry.id === 'contact-support'))
})
