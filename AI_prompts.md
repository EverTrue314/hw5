# AI Prompts

## Question 1 — Vibe coder prompts

### First prompt

> Create AI_prompts.md and keep it updated as I work through. There should be sections for questions 1-11. For each question, record the number and title, the first prompt that I type, and then any follow up prompts. For any follow up prompts include one sentence on what was lacking after the first.

### Follow-up prompts

None so far.

## Question 2 — Study the campus customs database

### First prompt

> There's a zip file in the folder. Unzip it and confirm that you can see the campus customs database.

### Follow-up prompts

1. > open data/campus_customs.db and look through every table and its fields. Then copy the original file to data/campus_customs_new.db becuase we'll use that in later questions. Then start output/harness.md and for each table, list the fields and one short line on why that table matters for the agents.

   The first prompt only confirmed that the database file existed; it did not inspect its tables, create a working copy, or document why the tables matter to the agents.

## Question 3 — Build the MCP server

### First prompt

> I need to build an MCP server in mcp_server/ using FastMCP and it will talk to data/campus_customs_new.dbDon't connect or run it yet.
>
> Every agent in this homework will use the tools in this MCP server. Write three tools needed for the tickets in the database. Have clear names, never invent any data, and only use the information in the database.
>
> List these three MCP tools in output/harness.md. For every tool include which table it reads, which ticket it helps unlock, and one sentence on why that tool is the right one for that ticket.
>
> Any vague lines like "reads inventory" are going to score low with graders so make sure to tie the tool with the ticket and provide enough context.
>
> Add a mcp_server/readme.md file that explains what the MCP server is for, which database file it uses, and the three tools that it has. Keep this file short.

### Follow-up prompts

None so far.

## Question 4 — Add the MCP server to vibe coder and test each tool

### First prompt

> Now I want to add the MCP server to this project and save the connection JSON txt in .mcp.JSON at the project root (or however you save local MCP srver lists). Just let me know how its saved.

### Follow-up prompts

1. > Now I want to test each of the tools. Save the evidence in output/mcp_smoke.json. For every tool include the prompt I asked, the tool name, and the tool outpt (must match values in data/campus_customs_new.db). Prompt for tool 1: Run `get_ticket_101_tee_reprint_context`. Show me the tee order, size-S stock and price, and its linked reprint invoice and vendor. Check that the results match `data/campus_customs_new.db` and show me the actual output. Prompt for tool 2: Run `get_ticket_102_rent_context`. Show me the rent notice and the lease connected to it. Check that the information matches `data/campus_customs_new.db` and show me the actual output. Prompt for tool 3: Run `get_ticket_103_bulk_hoodie_context`. Show me the bulk hoodie request, size-M stock and price. Check that the results match `data/campus_customs_new.db` and show me the actual output. Make sure to report any errors.

   The first request added the MCP connection and verified basic tool calls, but it did not save each prompt with the complete tool output or independently compare the outputs with the database.

## Question 5 — Build the agent team and grow the MCP tools

### First prompt

> I want to build an agentic team for campus customs using pydantic AI. The agents I want are Boss, Inventory, Accounting, Facilities, and Customer service. Include prompts, models and agent loops so they can delegate work to each other with full connectivity.
>
> Put the agent prompts in backend/prompts/. there will be one file per agent. Put data types in backend/models.py and the agent fules under backend/. I want to use portkey api for this and only gpt-6-luna for every agent.
>
> shop facts come from the MCP server over data/campus_customs_new.db. Do not invent a second shop-tools layer that bypasses the MCP.
>
> I'm going to give the agent specifics and some more instructions in the next prompt so hold off on doing anything until you've received the second prompt.

### Follow-up prompts

1. > All agents will append to output/audit_trail/json as they run. For each agent loop step, record enough to audit later. Append to this file-do not wipe it each run.
   >
   > here are the prompts for each agent to record in backend/prompts/. There should be one file for each agent.
   >
   > - Boss agent prompt: Your're the boss agent for campus customs. your job is to coordinate the other agents (inventory, accounting, facilities, and customer service) and make sure everything is handled correctly. You should read each ticket, decide which agent should work on it and delegate those tasks,and then combine thier findings into a clear final decision. Make sure that agents communicate with eachother when one agent's work depends on another to promote efficiency. The shop rules are: the field desk.date_today is today for the shop and use this date to determine what is overdue, don't guess. never approve shipping a new product if the invoice is open and unpaid. Any payment actions must be reviewed and approved by a human, you will NEVER make a payment action by yourself. NEVER email customers or call real vendors. any drafts you you get will remain as drafts.
   > - Inventory: you're the inventory agent. Use MCP tools to check stock by SKU and size, spot shortfalls and figure out which vendor can restock. Never invent data or chenge stock or prices without authorization. Report shortages or discrepencies to the boss. Never call real vendors.
   > - Accounting: you're the accounting agent for campus customs. Your job to watch cash and invoices, check margins, and prepare payments or purchase orders for human approval. Use MCP tools to accomplish this. A few shop rules: use desk,date_today to determine what is overdue, never approve shipping for an unpaid invoice or make payments yourself. flag discrepancies and request human review when needed.
   > - Facilities: you're the facilities agent. your job is to handle the shop space side including leases, rent, and more. using MCP tools to review rent notices, leases, and property deadlines. Shop rules: use desk.date_today for deadlines, never invent any information. Report any discrepancies  or issues to the boss.
   > - customer service: you're the campus customs customer service agent and your job is to draft messages for customers. Draft clear and polite reponses to customers using verified information from MCP tools and other agents. Never promise shipping when an invoice is unapid or make unapproved commitments. Escalate missing information or sensitive issues to the boss. you will only DRAFT emails never send.
   >
   > In output/harness.md, list each agent and MCP tool (including any new ones needed from the agent prompts) along with which table the tool uses. Aslo add a short safety section: I want guardrails around protecting customer and vendor information, any payment details, and making sure that everything is contained. Also limit the number of agent loops and calls so nothing runs like crazy and spends too much.
   >
   > update mcp_server/readme.md so the tool list is updated with the new info.

   The first prompt defined the team roles, model/provider, MCP-only data access, and folder layout, but did not include the agent-specific rules, append-only auditing, privacy controls, or run/call limits.

2. > add the payment tool so that the accounting agent can check available cash, prevents negative balances, and updates the cash account, invoice, and payment records. Make sure it still requires human review and approval. Make sure the inventory agent has the vendor shipping hold rules. I'll build the board for where we'll store drafts in a later question.
   >
   > what do you mean about the data limitation? what would the issue be?

   The previous prompt added payment proposals and vendor lookups, but not a human-gated payment transaction or an explicit check of a vendor's unpaid-invoice shipping hold.

3. > finish output/harness.md so it covers tables, MCP tools, the five agents, API routes, the dashboard, and safety rules

   The existing harness covered the database, tool matrix, agents, routes, and basic guardrails, but lacked a complete dashboard section and clearer limits around data exposure, external model processing, approvals, and workflow status.

## Question 6 — Plan the three tickets

### First prompt

> Build output/desk_tickets.html with one tab per ticket (101, 102, 103) and cash and reflection tabs. I'll fill out the cash and reflection tabs in later questions so leave those with a coming later note for now. On each ticket tab there will be an expected and actual section (will fill in later). Each tickets' expected section will have the following: who the boss should call first and why; all the agent delegations you expect; which MCP tools you expect that run to use. I'll give my answers to the expected sections for each ticket in my next prompt.

### Follow-up prompts

1. > For the expected section on the desk tickets html here are my responses. Add these to the expected section on each tickets tab.
   >
   > - ticket 101: I expect the boss to call the inventory agent first because the ticket deals with a t-shirt order that is potentially out of stock, which is an inventory question first. The boss, inventory, accounting, and customer service agents will be involved in resolving this ticket. The boss will use the get ticket and shop date tools, the inventory agent will use the get ticket summary, inventory stock, list vendors and check vendor shipping tools. Accounting agent will use the ticket summary, shop date, accounting snapshot and product pricing tools. The customer service agent will also use the ticket summary and inventory stock tools and the customer list price and invoice status tools.
   > - ticket 102: The boss should call the facilities agent first because the ticket deals with rent being due. The facilities agent is the one best equipped for the boss to contact first because it has the tools to reivew the necessary lease information related to the ticket. The boss uses the get ticket and shop date tools and shoudl call the facilities and accounting agents. The facilities agent will use the ticket summary, shop date, and lease details tools. The accounting agent will use the ticket summary, shop date, and get accounting snapshot tools.
   > - ticket 103: I expect the inventory agent to be the bosses first call becuase to proceed with next steps on the group order the team needs to understand what is in stock and what is not, which is exactly in the realm of the inventory agent's role. The boss should call inventory, accounting, and customer service agents to help with this ticket. The boss will use the get ticket tool. Inventory will use the ticket summary, inventory stock, list venfors, and vendor shipping hold tools. The accounting agent will use ticket summary, product pricing, ship date and accounting snapshot as its tools. The customer service agent will use ticket summary, get inventory stock, adn customer list price tools.

   The initial prompt created the ticket sections but left their expected plans blank until you provided the ticket-specific first calls, delegations, and MCP tools.

2. > for the agent delegations sections, add an intro part that says, the boss should call

   The previous wording listed the agents but did not explicitly state that the Boss should call them.

## Question 7 — Backend routes

### First prompt

> In backend/main.py, use FastAPI and add routes that do the following:
>
> - return the three tickets and whether each is open or resolved
> - take a ticket id and run the agent team on that ticket
> - return recent agent events (what each agent said and which tools they used) so the board can refresh
> - approve a payment or purchase after a human clicks approve (agents only prepare the pay; this route is what actually changes cash)
> - Return the current checking balance from cash_accounts
> - Reset the database to the original values when I want to try a fresh run
>
> The back end should run with uvicorn main:app --reload --port 8000
>
> In output/harness.md, list each route in one line (what url and what is does)

### Follow-up prompts



## Question 8 — Agent dashboard

### First prompt

> I want to build a frontend dashboard in frontend/ with react + vite + typescript. The page should call on the routes we built in the last problem and should do the following:
>
> - list all three tickets
> - let me pick one ticket and start the agent team on it
> - show each agent and what they are saying/doing while the ticket runs
> - mark a ticket resolved when the run finishes
> - show a short summary of what each agent did on that ticket
> - let a human approve a pay or purchase when asked
> - show the checking balance (should only drop after a human approved pay)
>
> I want the dashboard to look nice. For layout, have the tickets at the top and when you click on the name, it opens as a drop down with all of the details. Make each agent a bulldog in a t-shirt that says the agent's name/job in the same style as the thing we built for homework 4. I want to be able to watch how the agents are interacting too, so have some org chart or heirarchy setup that lets me see this. In output/design.md add what I choose for the dashboard look and why

### Follow-up prompts

1. > ok now I want the front end to talk to the backend at local host 8000. one the backend I want to allow the vite page origin so the browser is allowed to call those routes and I want to start the board so give me instructions on how to do that

   What was lacking after the first prompt: It described the dashboard features and layout but did not specify the backend URL, browser CORS access, or how to start and open the running board.

2. > make the tshirts and outline colors different for each agent. Also remove the periods after ticket desk, open tickets, meet the team, and live activity. Instead of delegation map say Team roster and have instead of meet the team I want it to say meet the pack

   What was lacking after the first prompt: The initial dashboard prompt did not specify agent-specific shirt and outline colors or these exact heading and section-label changes.



## Question 9 — Resolve the tickets

### First prompt

> Before testing the agents on a full run for the three tickets, reset the working database (`data/campus_customs_new.db`) again so it starts clean. Note the starting checking balance. Then I'm going to run all three tickets to resolve them.
>
> In `output/desk_tickets.html` fill out the actual section on each ticket's tab with which agents worked, what they delegated, and which tools were used. Then on the cash tab, itemize the money:
>
> - Starting checking balance (after the reset)
> - For each ticket: how cash changed when that ticket resolved, and why (which pay/purchase, dollar amount)
> - Ending checking balance (this must match `cash_accounts` in the working database)
>
> Double-check that the math is correct because the wrong cash math loses me points. Also save `output/resolved_tickets.json` with id, final status, short outcome, what each agent contributed, and any human approvals for each ticket. Create `output/resolved_board.html` with a space for a screenshot for each resolved ticket; I'll add them later.
>
> Append the real runs to `output/audit_trail.json`.
>
> Confirm that you understand everything you're supposed to record during the runs and then let me know once the database is reset so I can start the runs.

### Follow-up prompts

1. > that worked! but before I run the next two, here are a few updates based on that first run. There's no info on amount the ticket is for or that the agent is requesting approval for. How can I add that, so that when i have a request to approve something I know the amount that it's for and if possible a drop down with the invoice info. Also, don't add the full activity summary for each agent in the small box in the team roster section cause I cant read all of it. Having it below in the run stream section is enough

   What was lacking after the first prompt: The first run showed that the approval card did not make the requested amount or invoice details easy to verify, and the roster duplicated long agent statements already visible in the Run stream.

6. > it says amount not provided for invoice 1. why is that? also the summaries are kinda choppy and make them flow better in terms of sentences.

   What was lacking after the first prompt: The approval card still lacked a visible invoice total for ticket 101, and the activity and decision summaries needed smoother sentence flow.

7. > sorry I meant ticket 1

   What was lacking after the first prompt: The reference to “invoice 1” was ambiguous, so this clarification identifies ticket 101 as the one with the missing approval amount.

8. > I refreshed but now I don't see the run summary just that ticket 101 was resolved

   What was lacking after the first prompt: The dashboard kept the run summary only in browser memory, so refreshing cleared it even though the completed Boss summary remained in the audit events.

9. > thanks but also I can't see the payment approval request piece that we were fixing before the refresh

   What was lacking after the first prompt: Refresh recovery restored the Boss summary but did not restore the pending payment approval card, whose original action draft was intentionally omitted from the audit trail.

10. > Why does the invocie drop down say this "The proposed draft amount differs from the current invoice total. The approval amount below uses the database invoice total." is that referring to the total cash balance? If so, that's kinda confusing

   What was lacking after the first prompt: The warning did not name the two amounts it compared or clarify that the mismatch concerned the invoice rather than the checking balance.

11. > ok so remember how I mentioned that incorrect math will be a problem in terms of grading? is that going to be an issue or is it fine because at the end of the day the right amount was proposed for approval?

   What was lacking after the first prompt: The approval UI amount came from the verified invoice record, but the audit does not preserve the original agent draft amount, leaving uncertainty about which amount a grader might evaluate.

12. > why wasn't the original draft saved in the audit trail?

   What was lacking after the first prompt: Audit sanitization intentionally omitted all payment drafts, so the successful run's approval request could not be recovered verbatim after refresh.

13. > ok so I need to have a record of the successul run in my audit trail for submission so what should I do to correct this?

   What was lacking after the first prompt: The audit already contained the successful agent steps, but lacked an explicit, transparent supplement for the verified invoice amount and cash outcome, as well as a durable record of future human-review drafts.

14. > ok the test fr ticket 1 is complete. is everything recorded and the actual section for ticket 101 and cash tab on the desk tickets html updated?

   What was lacking after the first prompt: The ticket 101 Actual section and cash tab still had placeholders, and the cash tab needed to reflect the later human-approved invoice payment and current balance.

15. > that looks good but question on the inventory agent. Why is there such a difference in the tools I expected to be called and those called? was everything actually addressed in the run or am I missing something. My understanding is that the invoice is to restock the specific item that's out of stock but there's no vendor info or anything tied to the invoice. Is that correct or are we missing something?

   What was lacking after the first prompt: The recorded Actual section needed to distinguish the expected tools from those actually called and clarify whether paying invoice 501 represented a restock or only settled a vendor bill.

16. > I also have a problem in audit_trail.json 1 it says end of file expected? what does that mean and can you fix it

   What was lacking after the first prompt: The audit file contained newline-delimited JSON objects rather than one complete JSON document, which caused standard JSON parsers to reject it and required a format and reader update.

17. > ok so before testing the next two tickets i just want to make sure that we're not missing anything. Here's the scenario for the assignment. given the info that you have with the data, should anything have happened wiht ticket 101 that didn't that I need to address before moving on? [The prompt included the assignment scenario and shop rules.]

   What was lacking after the first prompt: The ticket notes needed to clarify whether invoice 501 actually authorized a restock, which vendor details are linked, and which expected agent/tool steps were omitted.

18. > ok so why is it pulling SKU instead of that info? It would better for the bulldog print co piece to be shown and used cause that's what the agent should be doing right?

   What was lacking after the first prompt: The dashboard omitted invoice-linked supplier fields, and Inventory lacked a narrow MCP lookup and an explicit shortfall workflow for connecting invoice suppliers with vendor candidates.

19. > ok and final update is for any ticket that has a human approval when resolved add an icon that shows that it was approved to the dashboard becuase the team summary mentions unpaid invoice but that was done.
>
> Also when the boss calls on the other agents can we make it look like a tennis ball being thrown out for the other agents to fetch and then when they return info to the boss show the ball going back?

   What was lacking after the first prompt: The ticket cards did not distinguish later human-approved payments or purchases from earlier run-time findings, and the team roster showed delegations without a visual handoff and return cue.

20. > same amount not provided issue as before and I know there's no invoice for this one but is there a way to reflect or summarize what they payment would be, for what, and to who like we did for ticket 1?

   What was lacking after the first prompt: The approval display expected an invoice amount, so ticket 102's invoice-free rent proposal did not show the verified lease amount, landlord, property, or due date and could not be approved through the rent-specific human review flow.

21. > amount sorry and no details on the lease details drop down

   What was lacking after the first prompt: Missing lease fields could become the string `undefined`, which formatted as `NaN`, and the approval panel did not use the recovered rent proposal's lease details as a fallback.

22. > perfect, make the updates to the actual section for ticket 102 and the cash tab

   What was lacking after the first prompt: Ticket 102's Actual section still had a placeholder, and the cash ledger did not include its later approved $2,400 rent payment or the resulting balance.

23. > just noticed that the run stream didn't update when ticket 102 was resolved

   What was lacking after the first prompt: The completed agent and tool events existed in the backend, but the dashboard did not wait for its final events refresh before leaving the live-run state, so the stream could remain stale after the resolved notice.

24. > I also can't see the full ticket names once its resolved and any approval badges are added. fix this so I can see the full ticket name and the badges below that

   What was lacking after the first prompt: The ticket header kept subjects to a single ellipsized line and placed status and approval badges beside the name, causing the title to truncate when the badges appeared.

25. > tried to run the third ticket and it was almost done but got this error message: Agent run failed (UsageLimitExceeded: total_tokens_limit). Check the append-only audit trail for the agent and tool step that failed. Failed runs leave tickets open; payments still require human approval.

   What was lacking after the first prompt: Ticket 103's three specialists completed, but the Boss exhausted the 12,000-token per-run limit while consolidating their findings, so the final decision was not recorded and the ticket remained open.

26. > so if I run it again, will it work? because I need to have a resolved ticket recorded in the actual section and for the assignment

   What was lacking after the first prompt: Raising the Boss token ceiling lowered the chance of another limit failure but still did not guarantee a completed run or preserve the finished specialist work if synthesis failed again.

27. > I ran it again but this time the boss didn't call the customer service agent, why?

   What was lacking after the earlier retry question: The retry guidance could not explain which specialists the Boss actually selected; the successful run's delegation and tool events were needed to separate recorded facts from inference.

28. > if not ticket 103 cash action then why do I see a proposed action amount for 22 dollars?

   What was lacking after the earlier prompt: The dashboard treated a dollar amount in a free-text price-override and sourcing draft as an actionable purchase amount instead of requiring a verified, typed approval proposal.

29. > can we add a section where that recommendation or draft is listed in the ticket drop down.

   What was lacking after the earlier prompt: The Boss recommendation and action draft were available in the run stream but were not shown with the ticket's own details.

30. > so does that mean that the ending balance of 160 is correct? it should match cash accounts in the database. this is important because having the right numbers is crucial for grading

   What was lacking after the earlier prompt: The cash ledger showed $160 but needed direct reconciliation against the working database's checking balance and recorded payment rows.

31. > perfect update the actual section and cash tab with the stuff from the successful run of ticket 103

   What was lacking after the earlier prompt: Ticket 103's successful-run record needed the specific $22 per-unit price floor and $264 unapproved sourcing estimate clearly distinguished from cash movements.

32. > for ticket 3 was there a draft email generated? or no because the customer service agent wasn't called

   What was lacking after the earlier prompt: The run record identified that Customer service was not called in the successful retry, but did not clarify whether either Ticket 103 attempt produced a customer email draft.

33. > got it but that agent does have a tool to draft messages to customers right? those drafts would need human-review but hypothetically if that agent was called in the run would it generate the draft?

   What was lacking after the earlier prompt: The audit showed no email draft, but did not distinguish the Customer service agent's structured draft output from its read-only MCP tools or explain whether drafting is guaranteed when delegated.

34. > what does the draft mesasge field mean? is that not a tool

   What was lacking after the earlier prompt: The explanation did not clearly define `draft_message` as structured agent output rather than a callable tool.

35. > ok got it. Here are the screenshots for the tickets to add to the resolved board. [Six screenshots were attached: ticket details and agent run stream for tickets 101, 102, and 103.]

   What was lacking after the earlier prompt: The resolved board had one generic screenshot placeholder per ticket, while the supplied set contains separate ticket-detail and run-stream screenshots for all three tickets.

36. > ok all the screenshots are in the screenshots folder

   What was lacking after the earlier prompt: The screenshots were visible in chat but not yet available as workspace files, so the board still could not embed the images.

37. > the sizing of the run stream pictures is weird. Try having the screenshots on top of eachother for each ticket instead of side by side

   What was lacking after the earlier prompt: The two-column screenshot layout made the wide run-stream images too narrow to read comfortably.

38. > Agent run failed (ModelHTTPError; upstream HTTP 400). Check the append-only audit trail for the agent and tool step that failed. Failed runs leave tickets open; payments still require human approval. I got this error when rerunning ticket 101 with `gpt-6-luna`.

   What was lacking after the earlier prompt: The model configuration and database reset were prepared, but Portkey’s acceptance of `gpt-6-luna` had not been verified; the first request failed before any MCP tool ran.

39. > ok I did all of the runs with the updated stuff. Record the actual details in the actual sections of the dashboard. replace the ones that are currently there for actual only. Leave expected as is and leave the note that there is some historical data in the code that reflects previous calls but the actual sections listed here are the correct runs. Also update the cash tab with the correct runs info and make sure these runs were recorded in the resolved tickets json. I'll add the updated screenshots for the resolved board in a later prompt

   What was lacking after the earlier prompt: The new successful `gpt-6-luna` runs and their human-approved payments had not yet replaced the historical Actual sections, cash ledger, or resolved-ticket summaries.

40. > add an ending balance line on the cash tab and make the - and 2400 on the same line for ticket 102

   What was lacking after the earlier prompt: The cash ledger showed the ending balance only in the math note, and its amount column could wrap the negative sign and `$2,400.00` onto separate lines.

41. > I added the updated screenshots to the folder. Each one that is for the updated runs has correct in the name. Update the resolved board with the correct screenshots and delete the old ones.

   What was lacking after the earlier prompt: The resolved board still pointed to screenshots from the earlier runs, while the updated screenshots had been added separately with `correct` in their filenames.

42. > remove the note on the page about the historical screenshots. You added updated ones

   What was lacking after the earlier prompt: The board still displayed a note saying its screenshots were from earlier runs, even after replacing them with the updated screenshots.

## Question 10 — Reflection

### First prompt

> question 10s title is reflection. I've added a word document to the folder called reflection that includes my thoughts. Add that to the reflection tab of the desk tickets page.

### Follow-up prompts

1. > Before I run the tickets again with `gpt-6-luna`, document which runs are the final model-compliant runs, and explain in the reflection why earlier runs used `gpt-5.6-luna` before switching to `gpt-6-luna`.

   The earlier run notes did not identify the model used or explain why the first runs used a different version from the assignment requirement.

2. > For the ticket planning desk, change the note to: The append-only audit trail retains historical calls, including earlier `gpt-5.6-luna` attempts before I updated to use the correct model, `gpt-6-luna`. The Actual sections, cash figures, and reflections on this page reflect the successful final runs using `gpt-6-luna`.

   The previous note did not use this requested wording, and the reflection still contained claims from earlier runs that did not match the successful final `gpt-6-luna` runs.

3. > I made updates to the reflection document to reflect my thoughts on the new runs. Update the reflection tab with this new info.

   What was lacking after the earlier prompt: The Reflection tab still reflected the prior assessment rather than the updated document’s evaluation of the final runs.



## Question 11 — Submit to GitHub

### First prompt

> the title for question 11 is submit to git hub. Here is the file tree I need for submission. I'll provide the repo link in the next prompt. make sure to put the link in output/github_url.txt
>
> remember to not push the real env so that no secrets are exposed. I do want to include both databases under data so graders can run the app easily. also readme should explain the following: copy original DB to the working copy when you need a clean run, start MCP server, start fastAPI backend, start the react board, reset the DB before a full three-ticket run.
>
> make sure to log this prompt before packaging everything for submission and let me know when you're ready for the link.
>
> [Attached image: requested submission tree with AI_prompts.md, requirements.txt, .env.example, .gitignore, .mcp.json, README.md, both database files, MCP server files, frontend, backend agent prompts and model files, and the listed output artifacts including github_url.txt.]

### Follow-up prompts

1. > here's the link [https://github.com/EverTrue314/hw5.git](https://github.com/EverTrue314/hw5.git)

   What was lacking after the first prompt: The target repository URL was still pending, so the URL file could not be finalized.

2. > don't push yet just add to the url file

   What was lacking after the earlier prompt: The URL had been provided, but the user clarified that only the URL file should be updated for now and nothing should be pushed.
