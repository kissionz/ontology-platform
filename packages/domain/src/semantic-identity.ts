import type { OntologyObject, OntologyProperty } from "../../contracts/src/index.js";
export function nameProperties(object: OntologyObject): OntologyProperty[] {
  const names = object.properties.filter(p => p.meaning === "NAME" && p.visibility === "ANALYTICAL" && !p.sensitive);
  return object.primaryNamePropertyId ? names.filter(p => p.id === object.primaryNamePropertyId) : names;
}
export function bindingPriority(object: OntologyObject, property?: OntologyProperty) {
  if (!property) return object.bindingPriority;
  const inherit = property.inheritBindingPriority ?? property.bindingPriority === 50;
  return inherit ? object.bindingPriority : property.bindingPriority;
}
