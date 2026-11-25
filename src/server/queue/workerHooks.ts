import { registerHooks } from "node:module"

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier !== "server-only") return nextResolve(specifier, context)
    return nextResolve(specifier, { ...context, conditions: [...context.conditions, "react-server"] })
  },
})
