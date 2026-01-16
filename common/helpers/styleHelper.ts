export const classnames = (classnameObject: Record<string, boolean>): string => {
  return Object.keys(classnameObject).reduce((text, classname) => {
    if (classnameObject[classname]) {
      if (text === '') {
        return classname
      } else {
        return text + ' ' + classname
      }
    }
    return text
  }, '')
}
