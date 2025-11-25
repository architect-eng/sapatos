# Implement Plan

You are tasked with implementing an approved technical plan from `thoughts/plans/`. These plans contain phases with specific changes and success criteria.

## Getting Started

When given a plan path:
- Read the plan completely and check for any existing checkmarks (- [x])
- Read the original ticket and all files mentioned in the plan
- **Read files fully** - never use limit/offset parameters, you need complete context
- Think deeply about how the pieces fit together
- Create a todo list to track your progress
- Start implementing if you understand what needs to be done
- Make sure to regularly write back to the plan file with your progress so that you can pick up where you left off

If no plan path provided, ask for one.

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- IMPORTANT: Update checkboxes in the plan as you complete sections
- IMPORTANT: Update the plan's frontmatter `status` field as you progress (draft → in_progress → completed)

When things don't match the plan exactly, think about why and communicate clearly. The plan is your guide, but your judgment matters too.

If you encounter a mismatch:
- STOP and think deeply about why the plan can't be followed
- Present the issue clearly:
  ```
  Issue in Phase [N]:
  Expected: [what the plan says]
  Found: [actual situation]
  Why this matters: [explanation]

  How should I proceed?
  ```

CRITICAL: keep in mind that your context window may be wiped at any moment, so you MUST keep track of your work in the plan file so that you can pick the work back up where you left off with a fresh context window.

## Verification Approach

After implementing a phase:
- Run the success criteria checks using the `build_summary` subcommand (this runs the full validation suite and provides a clear summary)
- Fix any issues before proceeding
- IMPORTANT: Update your progress in both the plan and your todos
- IMPORTANT: Check off completed items in the plan file itself using Edit
- IMPORTANT: Update the plan's frontmatter `last_updated` and `last_updated_by` fields
- IMPORTANT: When plan is fully implemented, update status to `completed` in frontmatter

Don't let verification interrupt your flow - batch it at natural stopping points.

To run validation:
- Use the `build_summary` subcommand which will run `mise commit` and provide a structured summary of any linting, typechecking, or test errors
- Review the summary and fix issues systematically by module
- Do this instead even if the plan tells you to run `mise commit`

## If You Get Stuck

When something isn't working as expected:
- First, make sure you've read and understood all the relevant code
- Consider if the codebase has evolved since the plan was written
- Present the mismatch clearly and ask for guidance

Use sub-tasks sparingly - mainly for targeted debugging or exploring unfamiliar territory.

## Resuming Work

If the plan has existing checkmarks:
- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off
- Check the plan's frontmatter `status` field to understand current state:
  - `draft`: Plan not yet approved for implementation
  - `approved`: Ready to implement but not started
  - `in_progress`: Currently being implemented
  - `completed`: Fully implemented
  - `cancelled`: No longer needed

Remember: You're implementing a solution, not just checking boxes. Keep the end goal in mind and maintain forward momentum.