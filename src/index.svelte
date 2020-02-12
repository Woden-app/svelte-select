<script>
import { createEventDispatcher } from 'svelte'
import clickOutside from '@woden/svelte-click-outside'

export let fetchInit
export let url
export let placeholder = ''
export let disabled
export let delay = 250
export let id
export let texts = {
    selectAll: 'Tous',
    searching: 'Recherche en cours..',
    noResult: 'Aucun résultat à afficher'
}

// Prevent texts properties from being undefined
if (!texts.selectAll) texts.selectAll = 'Tous'
if (!texts.searching) texts.searching = 'Recherche en cours..'
if (!texts.noResult) texts.noResult = 'Aucun résultat à afficher'

const dispatch = createEventDispatcher()

let selected
let isToggle = false
let isSearching = false
let promise
let input
let init = {
    method: 'GET',
    headers: {
        'Content-Type': 'application/json'
    },
    data: params => params,
    processResults: results => results
}

// Compute fetch properties
Object.assign(init, fetchInit)

const toggle = () => {
    if (disabled) return

    isToggle = !isToggle

    // À l'ouverture du select on prefetch des résultats à afficher
    if (isToggle) promise = search(null, 0)
}

const search = (e, timeout = delay) => {
    if (!isSearching) {
        isSearching = true

        return new Promise((resolve) => setTimeout(async () => {
            let endpoint = url
            let i = 0
            for (const [key, value] of Object.entries(init.data({ terms: e ? e.target.value : '' })))
                if (value) {
                    endpoint += `${i === 0 ? '?' : '&'}${key}=${value}`
                    i++
                }

            try {
                const res = await fetch(endpoint, init)

                if (res.ok) resolve(init.processResults(await res.json()))
                else throw res
            } catch (err) {
                input.blur()
                dispatch('error', err)
            } finally {
                isSearching = false
            }
        }, timeout))
    }
}

const selectItem = result => {
    selected = result ? result.id : null
    isToggle = false
    input.value = result ? result.name : texts.selectAll

    dispatch('selectItem', result)
}
</script>

<style>
.select {
    position: relative;
}
input {
    border: 1px solid #d2ddec;
    width: 100%;
    padding: .5rem 1.9rem .5rem .75rem;
    display: inline-block;
    border-radius: .375rem;
    cursor: pointer;
    overflow: hidden;
    background: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3e%3cpath fill='%23343a40' d='M2 0L0 2h4zm0 5L0 3h4z'/%3e%3c/svg%3e") no-repeat right .75rem center/8px 10px;
}
.container {
    position: absolute;
    width: 100%;
    background-color: #fff;
    max-height: 200px;
    z-index: 4;
    border: 1px solid rgba(0,0,0,.125);
    border-top: none;
    border-bottom-left-radius: .3rem;
    border-bottom-right-radius: .3rem;
}
ul {
    padding: 0;
    margin: 0;
    list-style: none;
}
li {
    padding: .3rem .6rem;
    cursor: pointer;
}
li.selected {
    background-color: #f4f5f8;
}
li:not(.unselectable):hover {
    background-color: #f4f5f8;
}

#fade {
    position: absolute;
    width: 100%;
    height: 100%;
    cursor: pointer
}
</style>

<div
    class="select"
    use:clickOutside={() => {
        if (isToggle) isToggle = false
    }}
>
    <!-- Create fake fade to prevent all component detect click event -->
    {#if !isToggle}
        <div
            id="fade"
            on:click|stopPropagation={() => {
                toggle()
                input.focus()
            }}
        />
    {/if}

    <input
        {id}
        bind:this={input}
        type="text"
        {placeholder}
        {disabled}
        on:focus={() => {
            if (!isToggle) toggle()
        }}
        on:keydown={e => {
            if (e.which === 27) {
                isToggle = false
                input.blur()
            }
        }}
        on:input={e => (promise = search(e))}
    />

    {#if isToggle}
    <div class="container">
        <ul>
            {#await promise}
                <li class="unselectable" on:click={() => input.focus()}>
                    {texts.searching}
                </li>
            {:then results}
                {#if results && results.length > 0}
                    <li on:click={() => selectItem(null)}>{texts.selectAll}</li>
                    {#each results as result}
                        <li
                            class:selected={result.id === selected}
                            on:click={selectItem(result)}
                        >
                            {result.name}
                        </li>
                    {/each}
                {:else}
                    <li class="unselectable" on:click={() => input.focus()}>
                        {texts.noResult}
                    </li>
                {/if}
            {/await}
        </ul>
    </div>
    {/if}
</div>