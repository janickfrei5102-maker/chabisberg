/**
 * Singleton repo instances bound to the app DB connection.
 * Routes import from here. Tests create fresh instances via the factory functions.
 */
const db = require('./index');

module.exports = {
  addresses: require('./addresses')(db),
  users: require('./users')(db),
  residents: require('./residents')(db),
  tokens: require('./tokens')(db),
  posts: require('./posts')(db),
  attachments: require('./attachments')(db),
};
