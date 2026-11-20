/**
 * Standard 5-Step Tool Definitions for Autonomous Workforce Agents
 */
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_subtask',
      description: 'Creates a child ticket with an acceptance checklist and assigns it to a subordinate agent.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Clear title of the subtask' },
          description: { type: 'string', description: 'Detailed work instructions for the child ticket' },
          assigneeRole: {
            type: 'string',
            enum: ['cto', 'engineer', 'researcher', 'marketer', 'qa', 'general'],
            description: 'Role of the subordinate agent to execute this subtask'
          },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Priority level of this ticket'
          },
          acceptanceCriteria: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of verifiable criteria required before marking done'
          }
        },
        required: ['title', 'description', 'assigneeRole']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'post_comment',
      description: 'Posts a progress update, technical finding, or @mentions another agent to collaborate.',
      parameters: {
        type: 'object',
        properties: {
          body: { type: 'string', description: 'Comment text content. Use @Role or @AgentName to notify.' }
        },
        required: ['body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'attach_deliverable',
      description: 'Attaches a deliverable, code link, document URL, or Cloudinary file link to the ticket.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['link', 'markdown', 'file'],
            description: 'Type of deliverable attached'
          },
          label: { type: 'string', description: 'Human-readable label for the deliverable' },
          url: { type: 'string', description: 'URL link to the file, commit, PR, or hosted resource' }
        },
        required: ['kind', 'label', 'url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_for_review',
      description: 'Moves the current ticket to "in_review" for QA sign-off and releases the execution checkout lock.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Summary of work completed against acceptance criteria' }
        },
        required: ['summary']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'request_hire',
      description: 'Submits a formal hiring request for a new subordinate agent to the human operator for approval.',
      parameters: {
        type: 'object',
        properties: {
          role: {
            type: 'string',
            enum: ['cto', 'engineer', 'researcher', 'marketer', 'qa', 'general'],
            description: 'Role of the proposed agent'
          },
          title: { type: 'string', description: 'Title or specialization (e.g. Lead Frontend Engineer)' },
          budgetMonthlyCents: { type: 'number', description: 'Requested monthly budget in USD cents (e.g. 200 = $2.00)' },
          justification: { type: 'string', description: 'Reasoning why this additional agent is required' }
        },
        required: ['role', 'title', 'justification']
      }
    }
  }
];

module.exports = {
  AGENT_TOOLS
};
