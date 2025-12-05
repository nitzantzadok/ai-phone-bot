/**
 * Models Index - Export all models
 */

const User = require('./User.model');
const Business = require('./Business.model');
const Call = require('./Call.model');
const Reservation = require('./Reservation.model');
const Error = require('./Error.model');

module.exports = {
  User,
  Business,
  Call,
  Reservation,
  Error
};
