GUIDELINES.md


THIS DOCUMENT DESCRIBES GENERAL GUIDELINES THAT MUST BE FOLLOWED. ANY DEVIATION FROM THESE GUIDELINES MUST BE CLEARLY IDENTIFIED AT THE POINT OF DEVIATION, INCLUDING A REFERENCE TO THE SPECIFIC GUIDELINE AND THE JUSTIFICATION FOR THE DEVIATION. GUIDELINES THAT ARE NOT APPLICABLE NEED NOT BE MENTIONED.


1. Relevant folders to consider. Read README.md in these folders and all sub-folders for more information. Do not read any other folder.
   - ./ => root folder with GUIDELINES.md, .env, oackage.json and tsconfig.json . DO NOT READ SUB-FOLDERS!
   - ./debug_analysis => files helping to understand issues and bugs reported .
   - ./design => architecture and design documents, e.g. for request bundling, data base structure, etc. .
   - ./doc => user-meant instructions (e.g setup guides, user manuals, configuration instructions, etc. ).
   - ./scripts => scripts for development.
   - ./src => source code folder. 
   - ./static => static files, e.g. icons, images, etc. .
2. Read through the documents in ./design ; file names shall give indication if relevant or not.
3. Frontend uses 100% Client-Side-Rendering.
3. Every ElysiaJS Sub-Application gets its own client JavaScript bundle, supporting caching and etag (1 year life time).
4. All configuration parameters must follow the `Config` structure in ./design/configuration.md
5. For any data update (including disable/delete) use optimistic locking. I.e. request "lastUpdated" [TODO: check schema field name!] information and compare with entry in data base.
6. Implement websocket to notify frontend of user about data changes by other users / REST endpoints. Keep scope as narrow as possible, e.g. by tracking server-side what resource the frontend renders and if it affected by data change. Use the /src/services/PubSub.ts service.
7.  Directories may contain README.md files to explain the purpose of the directory and its content.
8. For client/server communication follow the concept of request bundling (`/design/request_bundling.md`).
9. Unit tests are supposed to run with `bun test`. End-to-end test are to be created for 'Playwright'. Do not run tests by yourself. Never run the application by yourself. When functionality changes, review existing tests to identify update demands.
10. Establish zero-trust between client and backend. Client to validate data sent to backend and respect permissions. Backend must validate data received, as well as permission validation.
11. Members of `cfgRootUserGroup` (see /src/services/AuthType.ts) have full permissions. This is the only way to bypass permission checks. Do not implement any other bypasses.
12. Never issue any drizzle ORM data base activity outside of /src/repo - unless it already exists in the code base.
13. When an operation involves multiple data base operations run them within /src/services/DatabaseDriver.ts `runInTransaction` function.
14. All UI texts must be in English.
15. For "optimistic locking" use the `updatedAt` field in the database schema (`/src/schema/helpers.ts`, `timestampColumnType`). Then round-trip: read data on server including `updatedAt` > forward to UI / API > edit data > forward edited data including `updatedAt` to server > server to issue `UPDATE ... SET ..., updatedAt = now() WHERE ... AND updatedAt = <updatedAt received from client>`.

** STOP READING HERE. THE FOLLOWING GUIDELINES ARE NOT YET FINALIZED AND MAY CHANGE IN THE FUTURE. **
