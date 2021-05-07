/**
 * Validate the params passed into a Socket event function
 * @param {object} model The model to base params on
 * @param {object} params The params passed from client
 * @param {string} nestedText Parent property names
 */
function validateParams(model, params, nestedText) {
  for (const key in model) {
    const prop = `${nestedText}.${key}`;

    // Get the required param
    const property = model[key];
    const param = params[key];

    // If param is not provided and not required
    if (typeof param === "undefined" && !property.required) {
      return { ok: true };
    }

    // If param is not provded
    if (typeof param === "undefined" && property.required) {
      return {
        ok: false,
        error: `${prop} is required, but was not provided.`
      };
    }

    // If expecting an array
    // NOTE typeof param will equal object even if its an array
    // Thats why the type check below is an else if
    if (property.type === "array") {
      if (!(param instanceof Array)) {
        return { error: `${prop} was not an instance of Array` };
      }
    }

    // If incorrect type
    else if (typeof param !== property.type) {
      return {
        ok: false,
        error: `${prop} was type ${typeof param}, when it was supposed to be type ${
          property.type
        }`
      };
    }

    // If it's supposed to be an object
    if (property.type === "object") {
      // If not an object
      if (!(param instanceof Object)) {
        return { error: `${prop} was not an instance of Object` };
      }

      // Verify keys if child model
      if (property.model) {
        // Verify model is an object
        if (!(property.model instanceof Object)) {
          return {
            error: `${prop}'s model property was not of instance Object. This is an internal server error`
          };
        }

        // If is an array when expecting an object
        if (param instanceof Array) {
          return {
            error: `${prop} is an instance of Array instead of Object`
          };
        }

        // Loop through nested model keys
        const result = validateParams(property.model, param, `${prop}`);
        if (!result.ok) return result;
      }
    }

    if (typeof param === "string") {
      // If max length
      if (property.required && param.length < (property.minLength ?? 1)) {
        return { error: `${prop} is required` };
      }

      if (
        typeof property.maxLength === "number" &&
        param.length > property.maxLength
      ) {
        return {
          ok: false,
          error: `${prop} is longer than max length of ${property.maxLength}`
        };
      }
    }

    // Run validator function
    if (property.validator && typeof property.validator === "function") {
      const { isValid, error } = property.validator(param);
      if (!isValid) {
        return { ok: false, error };
      }
    }
  }

  return { ok: true };
}

module.exports = {
  /**
   * Build a missing property error
   * @param {object} object The object you want to check
   * @param {string[]} properties The array of keys you want to check
   */
  missingPropertyError(object, properties) {
    // Check if object is type object
    if (typeof object !== "object") {
      return "Object to check was not provided or of type object";
    }
    if (typeof properties === "undefined" || !properties.length) {
      return "Properties were not provided or of type array";
    }

    // Check which, if any, properties are unfilled
    let unprovided = [];
    for (let i = 0; i < properties.length; i++) {
      if (object[properties[i]] === undefined || object[properties[i]] === "") {
        unprovided.push(properties[i]);
      }
    }

    // Build requirements error message
    if (unprovided.length) {
      let resText = "No";
      let itemCount = unprovided.length - 1;
      for (let i = 0; i < unprovided.length; i++) {
        if (itemCount === i && i > 0) resText += " or";
        resText += ` ${unprovided[i]}`;
        if (i < itemCount) resText += itemCount > 1 ? "," : "";
      }
      return resText + " provided";
    }

    return "";
  },

  /**
   * Check for correct variable types
   * @param {any[]} properties The array of variables
   * @param {string[]} types The array of types
   */
  incorrectTypes(properties, types) {
    // Check which, if any, properties are incorrect type
    for (let i = 0; i < properties.length; i++) {
      if (typeof properties[i] !== types[i]) {
        return `${properties[i]} is type ${typeof properties[
          i
        ]} instead of type ${types[i]}`;
      }
    }

    return "";
  },

  validateParams
};
