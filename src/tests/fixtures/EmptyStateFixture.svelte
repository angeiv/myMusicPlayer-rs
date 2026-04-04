<script lang="ts">
  import EmptyState from '../../lib/components/ui/EmptyState.svelte';
</script>

<EmptyState title="No songs yet" body="Add a folder to start building the library.">
  <button slot="actions" type="button">Add Folder</button>
</EmptyState>
