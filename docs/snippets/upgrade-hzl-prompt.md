Create a script at scripts/upgrade-hzl.sh (in your workspace) that upgrades both the hzl-cli npm package and the hzl skill from ClawHub. The script should:

1. Run `npm install -g hzl-cli@latest`
2. Run `npx clawhub update hzl` from the workspace directory
3. Print the installed version after each step

Make it executable. In the future when I say "upgrade hzl", run this script.
