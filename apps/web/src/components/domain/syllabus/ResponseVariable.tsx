import { RESPONSE_KINDS, responseHasOptions, responseLabel, responseMany, type ResponseAttrs } from "@silabos/shared/lib/responseKinds"
import "./FreeTextEditor.css"

const VARIABLE = "document-variable document-response document-response--static"

/** A space for the teacher in a table cell or loose paragraph, drawn like the variable of the text editor. */
export function ResponseVariable({ attrs }: { attrs: ResponseAttrs }) {
  const mark = responseMany(attrs.kind) ? "checkbox" : "radio"

  return (
    <div className="free-text-editor min-w-0 py-1 text-sm" data-career-space={attrs.kind}>
      {responseHasOptions(attrs.kind) && attrs.options.length > 0 ? (
        <span className={`${VARIABLE} document-response--checks`} role="group" aria-label={RESPONSE_KINDS[attrs.kind]?.label}>
          {attrs.options.map((option) => (
            <span key={option.const} className="document-response__option" data-mark={mark}>
              {option.title}
            </span>
          ))}
        </span>
      ) : (
        <span className={VARIABLE}>{responseLabel(attrs)}</span>
      )}
    </div>
  )
}
