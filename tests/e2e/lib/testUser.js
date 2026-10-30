// Synthetic Telegram users for e2e runs. Real Telegram user ids are always
// positive, so a negative id can never collide with a real user's row in
// the production `users` table - safe to run against prod. first_name is
// tagged so these are trivially greppable in the DB for manual cleanup.
let counter = 0;

function makeTestUser(label = "user") {
  counter += 1;
  const id = -(1_000_000_000 + Date.now() % 1_000_000 * 1000 + counter);
  return {
    id,
    first_name: `E2E_TEST_${label}`,
    username: `e2e_test_${label}_${Math.abs(id)}`,
  };
}

module.exports = { makeTestUser };
