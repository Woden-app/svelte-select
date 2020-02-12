# svelte-select
An action that provides click outside detection for Svelte

## Installation
### Npm
    npm install --save @woden/svelte-select
### Yarn
    yarn add @woden/svelte-select
    
## Basic Usage
Import the package and use it as an action, provide a parameter which is the action you would like to fire when clickOutside is detected


```html
<script>
import Select from '@woden/svelte-select'

const myAjaxFunction = async () => {
  // Fetch some data from API
}
</script>

<label for="data">Data</label>
<Select
  id="data"
  url="http://api.mywebsite.com/endpoint"  
/>
```
