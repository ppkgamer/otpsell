const PLANS = {
  FREE: {
    label: 'Free',
    maxGmails: 1,
    maxSubUsers: 1,
  },
  BASIC: {
    label: 'Basic',
    maxGmails: 5,
    maxSubUsers: 10,
  },
  PRO: {
    label: 'Pro',
    maxGmails: -1,   // -1 = ไม่จำกัด
    maxSubUsers: -1,
  },
};

module.exports = PLANS;
