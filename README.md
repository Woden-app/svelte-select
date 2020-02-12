# svelte-select

## Installation
### Npm
    npm install --save @woden/svelte-select
### Yarn
    yarn add @woden/svelte-select
    
## Basic Usage
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
