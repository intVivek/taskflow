package api

import "encoding/json"

// Optional distinguishes "field absent" from "field explicitly null" in PATCH
// bodies. Set is true when the key appeared in the JSON at all.
type Optional[T any] struct {
	Set   bool
	Value *T // nil means explicit null
}

func (o *Optional[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if string(b) == "null" {
		o.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	o.Value = &v
	return nil
}
