const Company = require('../models/Company');

/**
 * Atomically increments company.issueCounter and returns the new issueNumber and formatted issueKey.
 * E.g., for issuePrefix 'PAP' and issueCounter 4, returns { issueNumber: 5, issueKey: 'PAP-5' }.
 */
const allocateIssueKey = async (companyId) => {
  const company = await Company.findByIdAndUpdate(
    companyId,
    { $inc: { issueCounter: 1 } },
    { new: true, select: 'issuePrefix issueCounter' }
  );

  if (!company) {
    throw new Error(`Company ${companyId} not found when generating issue key`);
  }

  const issueNumber = company.issueCounter;
  const issueKey = `${company.issuePrefix}-${issueNumber}`;

  return { issueNumber, issueKey };
};

module.exports = {
  allocateIssueKey,
};

